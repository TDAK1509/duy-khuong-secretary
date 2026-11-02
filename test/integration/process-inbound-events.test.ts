import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInboundStep, type InboundHandler } from '../../src/app/processing/inbound-step.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertInboundEvent, type EventRow } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');

const finishWithoutWriting: InboundHandler = (_event, stages) => stages.finishEvent(async () => {});

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

    await runInboundStep({ database: pool, clock, handler: finishWithoutWriting });

    const event = await readEvent(id);
    expect(event.status).toBe('done');
    expect(event.processed_at).toEqual(NOW);
  });

  async function readEvent(id: string): Promise<EventRow> {
    const [event] = await database.query<EventRow>(`SELECT * FROM inbound_events WHERE id = '${id}'`);
    if (!event) throw new Error('event not found');
    return event;
  }
});
