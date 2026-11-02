import { PG_MIGRATE_LOCK_ID } from 'node-pg-migrate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrationCommand } from '../../src/bootstrap/migrate.ts';
import { listAppliedMigrations } from './list-applied-migrations.ts';
import { createTemporaryDatabase, type TemporaryDatabase } from './temporary-database.ts';

const fixtures = new URL('./migration-fixtures/', import.meta.url);

describe('the migration runner', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createTemporaryDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('applies every migration to an empty database', async () => {
    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: new URL('two-tables/', fixtures), log: () => {} },
    );

    expect(exitCode).toBe(0);
    expect(await listAppliedMigrations(database)).toEqual(['0001_create_a', '0002_create_b']);
  });

  it('applies nothing on a second run', async () => {
    const directory = new URL('two-tables/', fixtures);
    const environment = { MIGRATION_DATABASE_URL: database.url };
    await runMigrationCommand(environment, { directory, log: () => {} });
    const lines: string[] = [];

    await runMigrationCommand(environment, { directory, log: (line) => lines.push(line) });

    expect(lines).toContain('[migrate] nothing to apply');
  });

  it('applies each migration once when two runners start together', async () => {
    await database.query('CREATE TABLE fixture_rows (id integer)');
    const directory = new URL('insert-row/', fixtures);
    const environment = { MIGRATION_DATABASE_URL: database.url };

    const exitCodes = await Promise.all([
      runMigrationCommand(environment, { directory, log: () => {} }),
      runMigrationCommand(environment, { directory, log: () => {} }),
    ]);

    expect(exitCodes).toEqual([0, 0]);
    expect(await database.query('SELECT id FROM fixture_rows')).toHaveLength(1);
  });

  it('leaves no partial schema when a migration fails', async () => {
    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: new URL('second-fails/', fixtures), log: () => {} },
    );

    expect(exitCode).not.toBe(0);
    expect(await database.query("SELECT to_regclass('b') AS found")).toEqual([{ found: null }]);
    expect(await listAppliedMigrations(database)).toEqual(['0001_create_a']);
  });

  it('runs a transactional migration with a short lock and statement timeout', async () => {
    await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: new URL('record-timeouts/', fixtures), log: () => {} },
    );

    expect(await database.query('SELECT lock_timeout, statement_timeout FROM seen')).toEqual([
      { lock_timeout: '1s', statement_timeout: '30s' },
    ]);
  });

  it('skips every migration when the database is ahead of this build', async () => {
    await database.query('CREATE TABLE fixture_rows (id integer)');
    await database.query(
      'CREATE TABLE pgmigrations (id serial PRIMARY KEY, name varchar(255) NOT NULL, run_on timestamp NOT NULL)',
    );
    await database.query("INSERT INTO pgmigrations (name, run_on) VALUES ('9999_future', now())");
    const lines: string[] = [];

    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: new URL('insert-row/', fixtures), log: (line) => lines.push(line) },
    );

    expect(exitCode).toBe(0);
    expect(lines).toContain(
      '[migrate] database is ahead of this build (rollback); skipping migrations',
    );
    expect(await database.query('SELECT id FROM fixture_rows')).toEqual([]);
  });

  it('gives up within the retry budget when another runner holds the migration lock', async () => {
    const otherRunner = await database.openSession();
    await otherRunner.query('SELECT pg_advisory_lock($1)', [PG_MIGRATE_LOCK_ID]);
    const lines: string[] = [];

    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      {
        directory: new URL('two-tables/', fixtures),
        log: (line) => lines.push(line),
        retry: { budgetMs: 1000 },
      },
    );

    expect(exitCode).toBe(1);
    expect(lines.join('\n')).toContain('gave up waiting for locks after 1000 ms');
    expect(await database.query("SELECT to_regclass('a') AS found")).toEqual([{ found: null }]);
  }, 10_000);
});
