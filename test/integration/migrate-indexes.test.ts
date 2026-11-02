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

  it('rebuilds an invalid index left by a failed build', async () => {
    await leaveInvalidIndex(database);

    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: concurrentIndex, log: () => {} },
    );

    expect(exitCode).toBe(0);
    expect(await database.query(`SELECT indisvalid FROM pg_index WHERE indexrelid = 't_idx'::regclass`))
      .toEqual([{ indisvalid: true }]);
  });

  it('rebuilds an invalid index whose quoted name has a space and a hyphen', async () => {
    await leaveInvalidIndex(database, '"t idx-1"');

    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      {
        directory: new URL('./migration-fixtures/concurrent-index-quoted/', import.meta.url),
        log: () => {},
      },
    );

    expect(exitCode).toBe(0);
    expect(await database.query(`SELECT indisvalid FROM pg_index WHERE indexrelid = '"t idx-1"'::regclass`))
      .toEqual([{ indisvalid: true }]);
  });

  it('never drops a valid index', async () => {
    await database.query('CREATE INDEX t_idx ON t (x)');
    const before = await database.query(`SELECT 't_idx'::regclass::oid AS oid`);

    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      {
        directory: new URL('./migration-fixtures/concurrent-index-if-absent/', import.meta.url),
        log: () => {},
      },
    );

    expect(exitCode).toBe(0);
    expect(await database.query(`SELECT 't_idx'::regclass::oid AS oid`)).toEqual(before);
  });

  it('gives a migration outside a transaction ten minutes per statement', async () => {
    await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: new URL('./migration-fixtures/record-build-timeout/', import.meta.url), log: () => {} },
    );

    expect(await database.query('SELECT statement_timeout FROM seen')).toEqual([
      { statement_timeout: '10min' },
    ]);
  });
});

async function leaveInvalidIndex(database: TemporaryDatabase, indexName = 't_idx'): Promise<void> {
  await database.query('INSERT INTO t VALUES (1), (1)');
  await expect(
    database.query(`CREATE UNIQUE INDEX CONCURRENTLY ${indexName} ON t (x)`),
  ).rejects.toThrow();
  expect(await database.query(`SELECT indisvalid FROM pg_index WHERE indexrelid = '${indexName}'::regclass`))
    .toEqual([{ indisvalid: false }]);
}
