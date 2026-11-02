import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleService, type Service } from '../../src/bootstrap/assemble-service.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

describe('the assembled service processes inbound events', () => {
  let database: TemporaryDatabase;
  let service: Service;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    service = assembleService({ DATABASE_URL: database.url }, () => {});
  });

  afterEach(async () => {
    await service.server.close();
    await service.pool.end();
    await database.drop();
  });

  it('records the sender of a stored event', async () => {
    const id = await insertInboundEvent(database, {});

    const outcome = await service.runInboundStep();

    expect(outcome).toBe('processed');
    expect(await database.query(`SELECT status FROM inbound_events WHERE id = '${id}'`)).toEqual([{ status: 'done' }]);
    expect(await database.query('SELECT external_user_id FROM channel_identities')).toEqual([
      { external_user_id: 'zu-hung' },
    ]);
  });
});
