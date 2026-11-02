import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrationCommand } from '../../src/bootstrap/migrate.ts';
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
      { directory: new URL('two-tables/', fixtures) },
    );

    expect(exitCode).toBe(0);
    expect(await listAppliedMigrations(database)).toEqual(['0001_create_a', '0002_create_b']);
  });
});

async function listAppliedMigrations(database: TemporaryDatabase): Promise<string[]> {
  const rows = await database.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY id');
  return rows.map((row) => row.name);
}
