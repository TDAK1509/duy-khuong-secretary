import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { claimInboundEvent } from '../../src/app/processing/claim-inbound-event.ts';
import type { ClaimedEvent } from '../../src/app/processing/claimed-event.ts';
import { recordSenderIdentity } from '../../src/app/processing/record-sender-identity.ts';
import type { Transaction } from '../../src/app/db/transaction.ts';
import { ClaimLostError, createStages, type Finished, type Stages } from '../../src/app/processing/stages.ts';
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

async function runTwoStages(event: ClaimedEvent, stages: Stages, onStageRun: (stage: string) => void): Promise<Finished> {
  await stages.runStage({
    isDone: (transaction) => hasStageRow(transaction, event.id, 'first'),
    write: async (transaction) => {
      onStageRun('first');
      await saveStageRow(transaction, event.id, 'first');
    },
  });
  return stages.finishEvent(async (transaction) => {
    onStageRun('second');
    await saveStageRow(transaction, event.id, 'second');
  });
}

async function hasStageRow(transaction: Transaction, eventId: string, stage: string): Promise<boolean> {
  const rows = await transaction.query('SELECT 1 FROM stage_rows WHERE event_id = $1 AND stage = $2', [eventId, stage]);
  return rows.length !== 0;
}

async function saveStageRow(transaction: Transaction, eventId: string, stage: string): Promise<void> {
  await transaction.query('INSERT INTO stage_rows VALUES ($1, $2)', [eventId, stage]);
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

  it('does not claim an event whose lock is still live', async () => {
    await insertInboundEvent(database, { status: 'processing', attempts: 1, lockedUntil: new Date(NOW.getTime() + 60_000) });
    const handler = recordCalls();

    await runStep(handler);

    expect(handler.calls).toEqual([]);
  });

  it('claims an event again after its lock expired', async () => {
    const id = await insertInboundEvent(database, {
      status: 'processing',
      attempts: 1,
      lockedUntil: new Date(NOW.getTime() - 60_000),
    });

    await runStep(finishWithoutWriting);

    expect(await readEvent(id)).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('rolls back the last stage of a worker that lost its claim', async () => {
    const id = await insertInboundEvent(database, {});
    const workerAEvent = await claim();
    clock.advanceBy(6 * 60_000);
    const workerBEvent = await claim();
    await createStages(pool, workerBEvent, clock).finishEvent(async () => {});

    const lateFinish = createStages(pool, workerAEvent, clock).finishEvent((transaction) =>
      transaction.query(
        `INSERT INTO channel_identities (channel, account_id, external_user_id, last_inbound_at) VALUES ('zalo-oa', 'oa-1', 'zu-hung', now())`,
      ).then(() => undefined),
    );

    await expect(lateFinish).rejects.toThrow(ClaimLostError);
    expect(await database.query('SELECT 1 FROM channel_identities')).toEqual([]);
    expect(await readEvent(id)).toMatchObject({ status: 'done', attempts: 2, processed_at: clock.now() });
  });

  it('skips a stage whose rows were saved before the crash', async () => {
    const id = await insertInboundEvent(database, {
      status: 'processing',
      attempts: 1,
      lockedUntil: new Date(NOW.getTime() - 60_000),
    });
    await database.query('CREATE TABLE stage_rows (event_id uuid NOT NULL, stage text NOT NULL)');
    await database.query(`INSERT INTO stage_rows VALUES ('${id}', 'first')`);
    const stageRuns: string[] = [];

    await runStep((event, stages) =>
      runTwoStages(event, stages, (stage) => stageRuns.push(stage)),
    );

    expect(stageRuns).toEqual(['second']);
    expect((await readEvent(id)).status).toBe('done');
  });

  it('holds back a second message until the first one of the same person is done', async () => {
    await insertInboundEvent(database, { availableAt: new Date(NOW.getTime() + 10_000) });
    await insertInboundEvent(database, {});
    const handler = recordCalls();

    await runStep(handler);

    expect(handler.calls).toEqual([]);
  });

  it('does not hold back the message of another person', async () => {
    await insertInboundEvent(database, { externalUserId: 'zu-hung', availableAt: new Date(NOW.getTime() + 10_000) });
    const id = await insertInboundEvent(database, { externalUserId: 'zu-lan' });

    await runStep(finishWithoutWriting);

    expect((await readEvent(id)).status).toBe('done');
  });

  it('processes the next message of a person whose earlier event failed', async () => {
    await insertInboundEvent(database, { status: 'failed', attempts: 5 });
    const id = await insertInboundEvent(database, {});

    await runStep(finishWithoutWriting);

    expect((await readEvent(id)).status).toBe('done');
  });

  async function claim(): Promise<ClaimedEvent> {
    const event = await claimInboundEvent(pool, clock.now());
    if (!event) throw new Error('no event to claim');
    return event;
  }

  function runStep(handler: InboundHandler): Promise<'processed' | 'idle'> {
    return runInboundStep({ database: pool, clock, alerts: new OperatorAlerts(alertSink, clock), handler });
  }

  async function readEvent(id: string): Promise<EventRow> {
    const [event] = await database.query<EventRow>(`SELECT * FROM inbound_events WHERE id = '${id}'`);
    if (!event) throw new Error('event not found');
    return event;
  }
});
