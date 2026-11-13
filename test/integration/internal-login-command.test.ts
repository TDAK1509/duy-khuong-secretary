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
import { FakeChatService } from '../fakes/fake-chat-service.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeMessagingChannel } from '../fakes/fake-messaging-channel.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { insertInternalUserWithoutWorkspace, makeUserInternal } from './internal-user-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ENCRYPTION_KEY = 'a'.repeat(64);

describe('asking for an admin page login code in Zalo', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let channel: FakeMessagingChannel;
  let alerts: OperatorAlerts;
  let reader: FakeReader;
  let chat: FakeChatService;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    channel = new FakeMessagingChannel();
    alerts = new OperatorAlerts(new FakeAlertSink(), clock);
    reader = new FakeReader();
    chat = new FakeChatService();
    const tokens = makeTokenPair({ accessToken: 'a1' });
    await storeConnection(pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens, storedAt: NOW }, ENCRYPTION_KEY);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('sends the explanation, then the code alone', async () => {
    const userId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await makeUserInternal(database, userId);

    await receiveText('zu-duy', 'đăng nhập quản trị');
    await sendAllQueuedTexts();

    expect(channel.texts.map((sent) => sent.to.externalUserId)).toEqual(['zu-duy', 'zu-duy']);
    expect(channel.texts[0]?.text).toBe(
      'Mã đăng nhập trang quản trị Trợ lý ở tin nhắn tiếp theo. Nhấn giữ tin nhắn đó để sao chép, rồi dán vào trang quản trị. Mã hết hạn sau 10 phút. Không đưa mã này cho ai, kể cả người nói là của Trợ lý.',
    );
    expect(channel.texts[1]?.text).toMatch(/^\S{4}-\S{4}$/);
  });

  async function receiveText(externalUserId: string, text: string): Promise<void> {
    await insertInboundEvent(database, { externalUserId, text });
    await runInboundStep({
      database: pool,
      clock,
      alerts,
      notices: new OffGroupNotices(clock, () => {}),
      handler: createInboundHandler({ channel, clock, database: pool, encryptionKey: ENCRYPTION_KEY, photoStorage: null, reader, chat }),
    });
  }

  async function sendAllQueuedTexts(): Promise<void> {
    const outbound = { database: pool, clock, alerts, notices: new OffGroupNotices(clock, () => {}), channel, photoStorage: null, encryptionKey: ENCRYPTION_KEY, maxPerMinute: 90, reportReadyTemplateId: null };
    while ((await runOutboundStep(outbound)) !== 'idle');
  }
});
