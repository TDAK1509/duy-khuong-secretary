import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrationCommand } from '../../src/bootstrap/migrate.ts';
import { createTemporaryDatabase, type TemporaryDatabase } from './temporary-database.ts';

const concurrentIndex = new URL('./migration-fixtures/concurrent-index/', import.meta.url);

describe('the migration runner building indexes', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createTemporaryDatabase();
    await database.query('CREATE TABLE t (x integer)');
  });

  afterEach(async () => {
    await database.drop();
  });

  it('builds a valid index concurrently', async () => {
    await database.query('INSERT INTO t SELECT generate_series(1, 1000)');

    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: concurrentIndex, log: () => {} },
    );

    expect(exitCode).toBe(0);
    expect(await database.query(`SELECT indisvalid FROM pg_index WHERE indexrelid = 't_idx'::regclass`))
      .toEqual([{ indisvalid: true }]);
  });
});
