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
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ENCRYPTION_KEY = 'a'.repeat(64);

describe('storing what a member sends', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let channel: FakeMessagingChannel;
  let alerts: OperatorAlerts;
  let workspaceId: string;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    channel = new FakeMessagingChannel();
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
      handler: createInboundHandler({ channel, clock, database: pool, encryptionKey: ENCRYPTION_KEY }),
    });
  }

  async function sendQueuedTexts(): Promise<void> {
    await runOutboundStep({ database: pool, clock, alerts, channel, encryptionKey: ENCRYPTION_KEY, maxPerMinute: 90 });
  }
});
