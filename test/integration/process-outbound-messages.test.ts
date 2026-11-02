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
import { insertOutboundMessage, type OutboundRow } from './outbound-message-rows.ts';
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

  it('marks a delivered text sent at the clock time', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, {});

    await runStep();

    expect(await readMessage(id)).toMatchObject({ status: 'sent', sent_at: NOW });
  });

  it("sends a person's texts in queue order", async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { body: 'phần 1' });
    await insertOutboundMessage(database, { body: 'phần 2' });

    await runStep();
    await runStep();

    expect(channel.texts.map((sent) => sent.text)).toEqual(['phần 1', 'phần 2']);
  });

  it("holds a person's later text while an earlier one waits for a retry", async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { availableAt: new Date(NOW.getTime() + 30_000), body: 'phần 1' });
    await insertOutboundMessage(database, { body: 'phần 2' });

    await runStep();

    expect(channel.texts).toEqual([]);
  });

  it("does not hold up another person's text", async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { externalUserId: 'zu-hung', availableAt: new Date(NOW.getTime() + 30_000) });
    await insertOutboundMessage(database, { externalUserId: 'zu-lan' });

    await runStep();

    expect(channel.texts.map((sent) => sent.to.externalUserId)).toEqual(['zu-lan']);
  });

  it('sends nothing once the per-minute limit is reached', async () => {
    await connectOa('oa-1', 'a1');
    const tenSecondsAgo = new Date(NOW.getTime() - 10_000);
    await insertOutboundMessage(database, { status: 'sent', sentAt: tenSecondsAgo });
    await insertOutboundMessage(database, { status: 'sent', sentAt: tenSecondsAgo });
    await insertOutboundMessage(database, { body: 'chờ' });

    await runStep(2);

    expect(channel.texts).toEqual([]);
  });

  it('puts a rate-limited text back in the queue for one minute', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, {});
    channel.nextTextResult = { ok: false, reason: 'rate_limited' };

    await runStep();

    expect(await readMessage(id)).toMatchObject({
      status: 'queued',
      available_at: new Date(NOW.getTime() + 60_000),
      last_error: 'rate_limited',
    });
  });

  it('retries a text that never reached Zalo after 30 seconds', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, { attempts: 0 });
    channel.nextTextResult = { ok: false, reason: 'unavailable' };

    await runStep();

    expect(await readMessage(id)).toMatchObject({
      status: 'queued',
      available_at: new Date(NOW.getTime() + 30_000),
      last_error: 'unavailable',
    });
  });

  async function connectOa(accountId: string, accessToken: string): Promise<void> {
    const tokens = makeTokenPair({ accessToken });
    await storeConnection(pool, { channel: 'zalo-oa', accountId, tokens, storedAt: NOW }, ENCRYPTION_KEY);
  }

  async function readMessage(id: string): Promise<OutboundRow> {
    const [row] = await database.query<OutboundRow>(`SELECT * FROM outbound_messages WHERE id = '${id}'`);
    if (!row) throw new Error('message not found');
    return row;
  }

  function runStep(maxPerMinute = 90): Promise<'processed' | 'idle'> {
    const alerts = new OperatorAlerts(alertSink, clock);
    return runOutboundStep({ database: pool, clock, alerts, channel, encryptionKey: ENCRYPTION_KEY, maxPerMinute });
  }
});
