import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrationCommand } from '../../src/bootstrap/migrate.ts';
import { repeatUntilSettled } from './repeat-until-settled.ts';
import { createTemporaryDatabase, type TemporaryDatabase } from './temporary-database.ts';

const alterThroughLock = new URL('./migration-fixtures/alter-through-lock/', import.meta.url);

describe('the migration runner on a busy table', () => {
  let database: TemporaryDatabase;
  let sessionA: pg.Client;

  beforeEach(async () => {
    database = await createTemporaryDatabase();
    await database.query('CREATE TABLE t (id integer)');
    sessionA = await database.openSession();
    await sessionA.query('BEGIN');
    await sessionA.query('SELECT count(*) FROM t');
  });

  afterEach(async () => {
    await database.drop();
  });

  it('never makes live queries queue behind the migration', async () => {
    const sessionC = await database.openSession();
    await sessionC.query("SET statement_timeout = '1500ms'");
    const lines: string[] = [];
    const running = runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: alterThroughLock, log: (line) => lines.push(line) },
    );

    const counts = repeatUntilSettled(running, () => sessionC.query('SELECT count(*) FROM t'));

    await expect(counts).resolves.not.toHaveLength(0);
    await running;
    expect(lines.join('\n')).toContain('could not obtain lock on relation "t"');
  });
});
