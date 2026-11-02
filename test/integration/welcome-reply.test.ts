import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runOutboundStep } from '../../src/app/delivery/outbound-step.ts';
import { createInboundHandler } from '../../src/app/processing/handle-inbound-event.ts';
import { runInboundStep } from '../../src/app/processing/inbound-step.ts';
import { OffGroupNotices } from '../../src/app/processing/off-group-notices.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeMessagingChannel } from '../fakes/fake-messaging-channel.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ENCRYPTION_KEY = 'a'.repeat(64);
const WELCOME =
  'Chào bạn. Đây là Trợ lý ghi chép công việc cho nhóm xe tải. Để bắt đầu, bạn nhắn mã mời mà quản lý nhóm đã gửi, ví dụ: MOI-7K4P9X.';

describe('the first reply to someone who never joined', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let channel: FakeMessagingChannel;
  let alerts: OperatorAlerts;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    channel = new FakeMessagingChannel();
    alerts = new OperatorAlerts(new FakeAlertSink(), clock);
    const tokens = makeTokenPair({ accessToken: 'a1' });
    await storeConnection(pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens, storedAt: NOW }, ENCRYPTION_KEY);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('sends the welcome text to someone who writes a text without an identity', async () => {
    await insertInboundEvent(database, { externalUserId: 'zu-hung', kind: 'text' });

    await runInboundThenOutboundStep();

    expect(channel.texts).toEqual([
      { to: { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-hung' }, text: WELCOME, credential: 'a1' },
    ]);
  });

  it('sends the welcome text to someone who sends a photo without an identity', async () => {
    await insertInboundEvent(database, { externalUserId: 'zu-hung', kind: 'images' });

    await runInboundThenOutboundStep();

    expect(channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([['zu-hung', WELCOME]]);
  });

  async function runInboundThenOutboundStep(): Promise<void> {
    const notices = new OffGroupNotices(clock, () => {});
    const handler = createInboundHandler({ channel, clock, database: pool, encryptionKey: ENCRYPTION_KEY, photoStorage: null, readers: null });
    await runInboundStep({ database: pool, clock, alerts, notices, handler });
    await runOutboundStep({ database: pool, clock, alerts, channel, encryptionKey: ENCRYPTION_KEY, maxPerMinute: 90 });
  }
});
