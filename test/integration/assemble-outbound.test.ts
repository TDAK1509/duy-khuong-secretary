import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleService, type Service } from '../../src/bootstrap/assemble-service.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertOutboundMessage } from './outbound-message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

describe('the assembled service sends outbound messages', () => {
  let database: TemporaryDatabase;
  let service: Service;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await service.server.close();
    await service.pool.end();
    await database.drop();
  });

  it('sends nothing while the zalo group is off', async () => {
    service = assembleService({ DATABASE_URL: database.url }, () => {});
    const id = await insertOutboundMessage(database, {});

    const outcome = await service.runOutboundStep();

    expect(outcome).toBe('idle');
    expect(await database.query(`SELECT status FROM outbound_messages WHERE id = '${id}'`)).toEqual([
      { status: 'queued' },
    ]);
  });
});
