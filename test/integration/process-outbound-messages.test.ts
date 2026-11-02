import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runOutboundStep } from '../../src/app/delivery/outbound-step.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeMessagingChannel } from '../fakes/fake-messaging-channel.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertOutboundMessage } from './outbound-message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ENCRYPTION_KEY = 'a'.repeat(64);

describe('the outbound worker step', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let alertSink: FakeAlertSink;
  let channel: FakeMessagingChannel;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    alertSink = new FakeAlertSink();
    channel = new FakeMessagingChannel();
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('sends a queued text to its recipient with the stored access key', async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { externalUserId: 'zu-hung', accountId: 'oa-1', body: 'chào' });

    await runStep();

    expect(channel.texts).toEqual([
      {
        to: { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-hung' },
        text: 'chào',
        credential: 'a1',
      },
    ]);
  });

  async function connectOa(accountId: string, accessToken: string): Promise<void> {
    const tokens = makeTokenPair({ accessToken });
    await storeConnection(pool, { channel: 'zalo-oa', accountId, tokens, storedAt: NOW }, ENCRYPTION_KEY);
  }

  function runStep(maxPerMinute = 90): Promise<'processed' | 'idle'> {
    const alerts = new OperatorAlerts(alertSink, clock);
    return runOutboundStep({ database: pool, clock, alerts, channel, encryptionKey: ENCRYPTION_KEY, maxPerMinute });
  }
});
