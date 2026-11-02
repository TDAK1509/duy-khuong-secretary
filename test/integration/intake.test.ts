import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runOutboundStep } from '../../src/app/delivery/outbound-step.ts';
import { createInboundHandler } from '../../src/app/processing/handle-inbound-event.ts';
import { runInboundStep } from '../../src/app/processing/inbound-step.ts';
import { OffGroupNotices } from '../../src/app/processing/off-group-notices.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeMessagingChannel } from '../fakes/fake-messaging-channel.ts';
import { FakePhotoStorage } from '../fakes/fake-photo-storage.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ENCRYPTION_KEY = 'a'.repeat(64);
const PHOTO_URL = 'https://z.test/1.jpg';

function makePng(size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(1);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function makeJpeg(size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(1);
  bytes.set([0xff, 0xd8, 0xff]);
  return bytes;
}

describe('storing what a member sends', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let channel: FakeMessagingChannel;
  let photoStorage: FakePhotoStorage;
  let alerts: OperatorAlerts;
  let workspaceId: string;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    channel = new FakeMessagingChannel();
    photoStorage = new FakePhotoStorage();
    alerts = new OperatorAlerts(new FakeAlertSink(), clock);
    const tokens = makeTokenPair({ accessToken: 'a1' });
    await storeConnection(pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens, storedAt: NOW }, ENCRYPTION_KEY);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('stores a text from a member in their chat', async () => {
    await receiveText('zu-hung', 'Hôm qua tôi gửi gì?');

    expect(await database.query(`SELECT workspace_id, user_id, author, text FROM messages WHERE author = 'user'`)).toEqual([
      { workspace_id: workspaceId, user_id: hungUserId, author: 'user', text: 'Hôm qua tôi gửi gì?' },
    ]);
  });

  it('replies to a text that only photos and work data are accepted', async () => {
    await receiveText('zu-hung', 'Hôm qua tôi gửi gì?');
    await sendQueuedTexts();

    expect(channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([
      [
        'zu-hung',
        'Trợ lý chỉ nhận ảnh và thông tin công việc. Bạn gửi ảnh hóa đơn, phiếu giao nhận hoặc giấy tờ bảo dưỡng để lưu nhé.',
      ],
    ]);
  });

  it('stores the reply as a bot message linked to the user message', async () => {
    await receiveText('zu-hung', 'chào');

    expect(
      await database.query(`
        SELECT reply.author, reply.workspace_id, reply.user_id, reply.reply_kind, reply.submission_status,
          reply.reply_to = original.id AS replies_to_original
        FROM messages reply JOIN messages original ON original.author = 'user'
        WHERE reply.author = 'bot'`),
    ).toEqual([
      {
        author: 'bot',
        workspace_id: workspaceId,
        user_id: hungUserId,
        reply_kind: 'answer',
        submission_status: 'accepted',
        replies_to_original: true,
      },
    ]);
  });

  it('stores a photo under the key of its message', async () => {
    channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(200_000) });

    await receivePhoto('zu-hung');

    const messages = await database.query<{ id: string }>(`SELECT id FROM messages WHERE author = 'user'`);
    expect(photoStorage.listKeys()).toEqual([`${workspaceId}/${messages[0]?.id}.jpg`]);
  });

  it('keeps the key and the caption of a photo message', async () => {
    channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });

    await receivePhoto('zu-hung', 'Xe 29C-123.45');

    const messages = await database.query<{ id: string; image_key: string; text: string }>(
      `SELECT id, image_key, text FROM messages WHERE author = 'user'`,
    );
    expect(messages).toEqual([
      { id: messages[0]?.id, image_key: `${workspaceId}/${messages[0]?.id}.jpg`, text: 'Xe 29C-123.45' },
    ]);
  });

  it('tells the sender that the photo was received', async () => {
    channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });

    await receivePhoto('zu-hung');
    await sendQueuedTexts();

    expect(channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([['zu-hung', 'Đã nhận ảnh.']]);
  });

  it('stores a PNG with the PNG extension and content type', async () => {
    channel.attachments.set(PHOTO_URL, { ok: true, bytes: makePng(1000) });

    await receivePhoto('zu-hung');

    const [key] = photoStorage.listKeys();
    expect(key).toMatch(/\.png$/);
    expect((await photoStorage.get(key ?? ''))?.contentType).toBe('image/png');
  });

  it('turns two photos of one event into two messages', async () => {
    channel.attachments.set('https://z.test/1.jpg', { ok: true, bytes: makeJpeg(1000) });
    channel.attachments.set('https://z.test/2.jpg', { ok: true, bytes: makeJpeg(2000) });

    await insertInboundEvent(database, {
      externalUserId: 'zu-hung',
      kind: 'images',
      imageUrls: ['https://z.test/1.jpg', 'https://z.test/2.jpg'],
    });
    await runInbound();

    expect(await database.query(`SELECT event_part FROM messages WHERE author = 'user' ORDER BY event_part`)).toEqual([
      { event_part: 0 },
      { event_part: 1 },
    ]);
    expect(photoStorage.listKeys()).toHaveLength(2);
  });

  it('refuses a photo over 5 MB without storing a message', async () => {
    channel.attachments.set(PHOTO_URL, { ok: false, reason: 'too_large' });

    await receivePhoto('zu-hung');
    await sendQueuedTexts();

    expect(channel.texts.map((sent) => sent.text)).toEqual([
      'Ảnh này lớn hơn 5 MB nên Trợ lý chưa nhận. Bạn gửi lại ảnh nhỏ hơn nhé.',
    ]);
    expect(await database.query('SELECT 1 FROM messages')).toEqual([]);
  });

  it('refuses a file that is not a JPEG or a PNG without storing a message', async () => {
    channel.attachments.set(PHOTO_URL, { ok: true, bytes: new TextEncoder().encode('%PDF-1.7 not a photo') });

    await receivePhoto('zu-hung');
    await sendQueuedTexts();

    expect(channel.texts.map((sent) => sent.text)).toEqual([
      'Trợ lý chỉ nhận ảnh dạng JPEG hoặc PNG. Bạn chụp lại rồi gửi nhé.',
    ]);
    expect(await database.query('SELECT 1 FROM messages')).toEqual([]);
  });

  async function receivePhoto(externalUserId: string, caption: string | null = null): Promise<void> {
    await insertInboundEvent(database, { externalUserId, kind: 'images', imageUrls: [PHOTO_URL], caption });
    await runInbound();
  }

  async function receiveText(externalUserId: string, text: string): Promise<void> {
    await insertInboundEvent(database, { externalUserId, text });
    await runInbound();
  }

  async function runInbound(): Promise<unknown> {
    return runInboundStep({
      database: pool,
      clock,
      alerts,
      notices: new OffGroupNotices(clock, () => {}),
      handler: createInboundHandler({ channel, clock, database: pool, encryptionKey: ENCRYPTION_KEY, photoStorage }),
    });
  }

  async function sendQueuedTexts(): Promise<void> {
    await runOutboundStep({ database: pool, clock, alerts, channel, encryptionKey: ENCRYPTION_KEY, maxPerMinute: 90 });
  }
});
