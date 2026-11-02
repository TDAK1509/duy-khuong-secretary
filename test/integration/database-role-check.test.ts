import { afterEach, describe, expect, it } from 'vitest';
import { assembleService, type Service } from '../../src/bootstrap/assemble-service.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { superuserDatabaseUrl } from './test-database-url.ts';

describe('checking the database role at start', () => {
  let service: Service;
  let database: TemporaryDatabase | undefined;

  afterEach(async () => {
    await service.pool.end();
    await service.server.close();
    await database?.drop();
    database = undefined;
  });

  it('refuses to start as a role that bypasses row-level security', async () => {
    service = assembleService({ DATABASE_URL: superuserDatabaseUrl }, () => {});

    await expect(service.checkDatabaseRole()).rejects.toThrow(/row-level security/);
  });
});
