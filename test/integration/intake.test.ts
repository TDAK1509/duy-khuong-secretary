import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, makeJpeg, makePng, NOW, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMembership, insertWorkspace } from './workspace-rows.ts';

describe('storing what a member sends', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;
  let hungUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId, hungUserId } = harness);
  });

  afterEach(async () => {
    await harness.close();
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

    expect(harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([
      [
        'zu-hung',
        'Trợ lý chưa thấy thông tin công việc cần lưu trong tin nhắn này. Nếu cần lưu, bạn nhắn rõ đây là việc gì, cho xe nào, bao nhiêu tiền nếu có nhé.',
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
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(200_000) });

    await receivePhoto('zu-hung');

    const messages = await database.query<{ id: string }>(`SELECT id FROM messages WHERE author = 'user'`);
    expect(harness.photoStorage.listKeys()).toEqual([`${workspaceId}/${messages[0]?.id}.jpg`]);
  });

  it('keeps the key and the caption of a photo message', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });

    await receivePhoto('zu-hung', 'Xe 29C-123.45');

    const messages = await database.query<{ id: string; image_key: string; text: string }>(
      `SELECT id, image_key, text FROM messages WHERE author = 'user'`,
    );
    expect(messages).toEqual([
      { id: messages[0]?.id, image_key: `${workspaceId}/${messages[0]?.id}.jpg`, text: 'Xe 29C-123.45' },
    ]);
  });

  it('stores a PNG with the PNG extension and content type', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makePng(1000) });

    await receivePhoto('zu-hung');

    const [key] = harness.photoStorage.listKeys();
    expect(key).toMatch(/\.png$/);
    expect((await harness.photoStorage.get(key ?? ''))?.contentType).toBe('image/png');
  });

  it('turns two photos of one event into two messages', async () => {
    harness.channel.attachments.set('https://z.test/1.jpg', { ok: true, bytes: makeJpeg(1000) });
    harness.channel.attachments.set('https://z.test/2.jpg', { ok: true, bytes: makeJpeg(2000) });

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
    expect(harness.photoStorage.listKeys()).toHaveLength(2);
  });

  it('refuses a photo over 5 MB without storing a message', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: false, reason: 'too_large' });

    await receivePhoto('zu-hung');
    await sendQueuedTexts();

    expect(harness.channel.texts.map((sent) => sent.text)).toEqual([
      'Ảnh này lớn hơn 5 MB nên Trợ lý chưa nhận. Bạn gửi lại ảnh nhỏ hơn nhé.',
    ]);
    expect(await database.query('SELECT 1 FROM messages')).toEqual([]);
  });

  it('refuses a file that is not a JPEG or a PNG without storing a message', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: new TextEncoder().encode('%PDF-1.7 not a photo') });

    await receivePhoto('zu-hung');
    await sendQueuedTexts();

    expect(harness.channel.texts.map((sent) => sent.text)).toEqual([
      'Trợ lý chỉ nhận ảnh dạng JPEG hoặc PNG. Bạn chụp lại rồi gửi nhé.',
    ]);
    expect(await database.query('SELECT 1 FROM messages')).toEqual([]);
  });

  it('asks for a photo again when it cannot be downloaded', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: false, reason: 'unavailable' });

    await receivePhoto('zu-hung');
    await sendQueuedTexts();

    expect(harness.channel.texts.map((sent) => sent.text)).toEqual(['Trợ lý chưa tải được ảnh này. Bạn gửi lại ảnh nhé.']);
    expect(await database.query('SELECT 1 FROM messages')).toEqual([]);
  });

  it('adds nothing when an event is processed again after a crash', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await receivePhoto('zu-hung');
    await database.query(
      `UPDATE inbound_events SET status = 'processing', locked_until = '${new Date(NOW.getTime() - 60_000).toISOString()}'`,
    );

    await runInbound();

    expect(await database.query(`SELECT author FROM messages ORDER BY author`)).toEqual([{ author: 'bot' }, { author: 'user' }]);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toHaveLength(1);
    expect(harness.channel.downloadedUrls).toEqual([PHOTO_URL]);
  });

  it('retries the event without replying when the photo storage fails', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.photoStorage.isFailing = true;

    await receivePhoto('zu-hung');

    expect(await database.query('SELECT status, attempts FROM inbound_events')).toEqual([{ status: 'queued', attempts: 1 }]);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
  });

  it('stores a message in the current workspace of the person', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải Thử');
    await insertMembership(database, { workspaceId: otherWorkspaceId, userId: hungUserId, displayName: 'Hùng' });
    await database.query(`UPDATE channel_identities SET current_workspace_id = '${otherWorkspaceId}'`);

    await receiveText('zu-hung', 'chào');

    expect(await database.query(`SELECT workspace_id FROM messages WHERE author = 'user'`)).toEqual([
      { workspace_id: otherWorkspaceId },
    ]);
  });

  it('keeps a photo waiting while photo storage is not configured', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });

    await insertInboundEvent(database, { externalUserId: 'zu-hung', kind: 'images', imageUrls: [PHOTO_URL] });
    await harness.runInbound({ photoStorage: null });

    expect(await database.query('SELECT status, attempts FROM inbound_events')).toEqual([{ status: 'queued', attempts: 0 }]);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
  });

  it('reads the uploaded photo when the event is processed again after its link expired', async () => {
    const eventId = await insertInboundEvent(database, { externalUserId: 'zu-hung', kind: 'images', imageUrls: [PHOTO_URL] });
    const messageId = '11111111-1111-4111-8111-111111111111';
    const imageKey = `${workspaceId}/${messageId}.jpg`;
    await database.query(
      `INSERT INTO messages (id, workspace_id, user_id, author, image_key, inbound_event_id, event_part)
       VALUES ('${messageId}', '${workspaceId}', '${hungUserId}', 'user', '${imageKey}', '${eventId}', 0)`,
    );
    await harness.photoStorage.put(imageKey, { bytes: makeJpeg(1000), contentType: 'image/jpeg' });
    harness.channel.attachments.set(PHOTO_URL, { ok: false, reason: 'unavailable' });

    await runInbound();
    await sendQueuedTexts();

    expect(harness.reader.requests.map((request) => request.image?.bytes.length)).toEqual([1000]);
    expect(harness.channel.downloadedUrls).toEqual([]);
    expect(await database.query('SELECT status FROM inbound_events')).toEqual([{ status: 'done' }]);
  });

  function receivePhoto(externalUserId: string, caption: string | null = null): Promise<void> {
    return harness.receivePhoto(externalUserId, caption);
  }

  function receiveText(externalUserId: string, text: string): Promise<void> {
    return harness.receiveText(externalUserId, text);
  }

  function runInbound(): Promise<unknown> {
    return harness.runInbound();
  }

  function sendQueuedTexts(): Promise<void> {
    return harness.sendQueuedTexts();
  }
});
