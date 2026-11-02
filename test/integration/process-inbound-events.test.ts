import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { recordSenderIdentity } from '../../src/app/processing/record-sender-identity.ts';
import { runInboundStep, type InboundHandler } from '../../src/app/processing/inbound-step.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertInboundEvent, type EventRow } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');

const finishWithoutWriting: InboundHandler = (_event, stages) => stages.finishEvent(async () => {});

const throwBoom: InboundHandler = async () => {
  throw new Error('boom');
};

class BoomError extends Error {
  override name = 'BoomError';
}

const throwBoomError: InboundHandler = async () => {
  throw new BoomError('boom');
};

type RecordingHandler = InboundHandler & { calls: string[] };

function recordCalls(): RecordingHandler {
  const calls: string[] = [];
  const handler: InboundHandler = (event, stages) => {
    calls.push(event.id);
    return stages.finishEvent(async () => {});
  };
  return Object.assign(handler, { calls });
}

describe('the inbound worker step', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let alertSink: FakeAlertSink;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    alertSink = new FakeAlertSink();
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('marks a queued event done', async () => {
    const id = await insertInboundEvent(database, {});

    await runStep(finishWithoutWriting);

    const event = await readEvent(id);
    expect(event.status).toBe('done');
    expect(event.processed_at).toEqual(NOW);
  });

  it('records the sender Zalo account with the time of the message', async () => {
    await insertInboundEvent(database, { sentAt: '2026-11-02T10:00:00+07:00' });

    await runStep(recordSenderIdentity);

    expect(await database.query('SELECT channel, account_id, external_user_id, last_inbound_at, user_id FROM channel_identities')).toEqual([
      {
        channel: 'zalo-oa',
        account_id: 'oa-1',
        external_user_id: 'zu-hung',
        last_inbound_at: new Date('2026-11-02T10:00:00+07:00'),
        user_id: null,
      },
    ]);
  });

  it('moves the latest message time forward when a later message arrives', async () => {
    await insertIdentity('2026-11-02T10:00:00+07:00');
    await insertInboundEvent(database, { sentAt: '2026-11-02T11:00:00+07:00' });

    await runStep(recordSenderIdentity);

    expect(await readLastInboundAt()).toEqual(new Date('2026-11-02T11:00:00+07:00'));
  });

  it('keeps the latest message time when an older message is processed late', async () => {
    await insertIdentity('2026-11-02T11:00:00+07:00');
    await insertInboundEvent(database, { sentAt: '2026-11-02T10:00:00+07:00' });

    await runStep(recordSenderIdentity);

    expect(await readLastInboundAt()).toEqual(new Date('2026-11-02T11:00:00+07:00'));
  });

  async function insertIdentity(lastInboundAt: string): Promise<void> {
    await database.query(
      `INSERT INTO channel_identities (channel, account_id, external_user_id, last_inbound_at)
       VALUES ('zalo-oa', 'oa-1', 'zu-hung', '${lastInboundAt}')`,
    );
  }

  async function readLastInboundAt(): Promise<Date | undefined> {
    const [identity] = await database.query<{ last_inbound_at: Date }>('SELECT last_inbound_at FROM channel_identities');
    return identity?.last_inbound_at;
  }

  it('puts a failed event back to queued with a wait of 30 seconds', async () => {
    const id = await insertInboundEvent(database, {});

    await runStep(throwBoom);

    expect(await readEvent(id)).toMatchObject({
      status: 'queued',
      attempts: 1,
      available_at: new Date(NOW.getTime() + 30_000),
    });
  });

  it('waits 60 seconds after a second failure', async () => {
    const id = await insertInboundEvent(database, { attempts: 1 });

    await runStep(throwBoom);

    expect(await readEvent(id)).toMatchObject({
      status: 'queued',
      attempts: 2,
      available_at: new Date(NOW.getTime() + 60_000),
    });
  });

  it('marks the event failed and alerts after the fifth failed attempt', async () => {
    const id = await insertInboundEvent(database, { attempts: 4 });

    await runStep(throwBoomError);

    expect((await readEvent(id)).status).toBe('failed');
    expect(alertSink.texts).toEqual([`[alert] Inbound event ${id} failed after 5 attempts: BoomError.`]);
  });

  it('does not claim an event that waits for a retry', async () => {
    await insertInboundEvent(database, { availableAt: new Date(NOW.getTime() + 10_000) });
    const handler = recordCalls();

    await runStep(handler);

    expect(handler.calls).toEqual([]);
  });

  function runStep(handler: InboundHandler): Promise<'processed' | 'idle'> {
    return runInboundStep({ database: pool, clock, alerts: new OperatorAlerts(alertSink, clock), handler });
  }

  async function readEvent(id: string): Promise<EventRow> {
    const [event] = await database.query<EventRow>(`SELECT * FROM inbound_events WHERE id = '${id}'`);
    if (!event) throw new Error('event not found');
    return event;
  }
});
