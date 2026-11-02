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
});
