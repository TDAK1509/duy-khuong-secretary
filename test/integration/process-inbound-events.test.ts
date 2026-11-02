import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordSenderIdentity } from '../../src/app/processing/record-sender-identity.ts';
import { runInboundStep, type InboundHandler } from '../../src/app/processing/inbound-step.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertInboundEvent, type EventRow } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');

const finishWithoutWriting: InboundHandler = (_event, stages) => stages.finishEvent(async () => {});

const throwBoom: InboundHandler = async () => {
  throw new Error('boom');
};

describe('the inbound worker step', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
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

  function runStep(handler: InboundHandler): Promise<'processed' | 'idle'> {
    return runInboundStep({ database: pool, clock, handler });
  }

  async function readEvent(id: string): Promise<EventRow> {
    const [event] = await database.query<EventRow>(`SELECT * FROM inbound_events WHERE id = '${id}'`);
    if (!event) throw new Error('event not found');
    return event;
  }
});
