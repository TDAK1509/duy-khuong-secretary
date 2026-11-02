import { afterEach, describe, expect, it } from 'vitest';
import { assembleService, type Service } from '../../src/bootstrap/assemble-service.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { signInAs, type TemporaryDatabase } from './temporary-database.ts';
import { superuserDatabaseUrl, testDatabaseUrl } from './test-database-url.ts';

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

  it('warns when it runs as the owner of the tables', async () => {
    const lines: string[] = [];
    database = await createMigratedDatabase(signInAs(testDatabaseUrl, 'app_owner'));
    service = assembleService({ DATABASE_URL: database.url }, (line) => lines.push(line));

    await service.checkDatabaseRole();

    expect(lines).toContain(
      '[config] database role owns the tables; row-level security is not enforced until DATABASE_URL uses app_runtime.',
    );
  });
});
