import { setTimeout } from 'node:timers/promises';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrationCommand } from '../../src/bootstrap/migrate.ts';
import { repeatUntilSettled } from './repeat-until-settled.ts';
import { listAppliedMigrations } from './list-applied-migrations.ts';
import { createTemporaryDatabase, type TemporaryDatabase } from './temporary-database.ts';

const alterThroughLock = new URL('./migration-fixtures/alter-through-lock/', import.meta.url);
const shortRetry = { budgetMs: 300, sleep: () => setTimeout(100) };

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
      { directory: alterThroughLock, log: (line) => lines.push(line), retry: shortRetry },
    );

    const counts = repeatUntilSettled(running, () => sessionC.query('SELECT count(*) FROM t'));

    await expect(counts).resolves.not.toHaveLength(0);
    await running;
    expect(lines.join('\n')).toContain('could not obtain lock on relation "t"');
  });

  it('fails its lock attempt at once instead of waiting for the lock', async () => {
    const observer = await database.openSession();
    const running = runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: alterThroughLock, log: () => {}, retry: shortRetry },
    );

    const waitingCounts = await repeatUntilSettled(running, () => countWaitingLocks(observer));

    expect(waitingCounts.every((count) => count === 0)).toBe(true);
    expect(await running).toBe(1);
  });

  it('releases its transaction and locks before it sleeps between attempts', async () => {
    const observer = await database.openSession();
    const observedWhileSleeping: RunnerState[] = [];

    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      {
        directory: alterThroughLock,
        log: () => {},
        retry: {
          sleep: async () => {
            observedWhileSleeping.push(await observeRunner(observer));
            await sessionA.query('COMMIT');
          },
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(observedWhileSleeping).toEqual([{ openTransactions: 0, locksOnT: 0 }]);
  });

  it('lands the migration once the conflicting transaction has ended', async () => {
    let sleeps = 0;

    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      {
        directory: alterThroughLock,
        log: () => {},
        retry: {
          sleep: async () => {
            sleeps += 1;
            if (sleeps === 2) await sessionA.query('COMMIT');
          },
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(sleeps).toBe(2);
    expect(await listAppliedMigrations(database)).toEqual(['0001_alter_t']);
  });

  it('stops once the retry budget is used up', async () => {
    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: alterThroughLock, log: () => {}, retry: { budgetMs: 3000 } },
    );

    expect(exitCode).not.toBe(0);
    expect(await database.query("SELECT to_regclass('pgmigrations') AS found")).toEqual([
      { found: 'pgmigrations' },
    ]);
    expect(await listAppliedMigrations(database)).toEqual([]);
  }, 15_000);
});

type RunnerState = { openTransactions: number; locksOnT: number };

async function observeRunner(observer: pg.Client): Promise<RunnerState> {
  const result = await observer.query<{ open_transactions: string; locks_on_t: string }>(
    `SELECT count(*) FILTER (WHERE state LIKE 'idle in transaction%') AS open_transactions,
            (SELECT count(*) FROM pg_locks WHERE pid = a.pid AND relation = 't'::regclass) AS locks_on_t
       FROM pg_stat_activity a
      WHERE application_name = 'migrate' AND datname = current_database()
      GROUP BY pid`,
  );
  return {
    openTransactions: sum(result.rows.map((row) => Number(row.open_transactions))),
    locksOnT: sum(result.rows.map((row) => Number(row.locks_on_t))),
  };
}

function sum(numbers: number[]): number {
  return numbers.reduce((total, number) => total + number, 0);
}

async function countWaitingLocks(observer: pg.Client): Promise<number> {
  const result = await observer.query<{ waiting: string }>(
    `SELECT count(*) AS waiting
       FROM pg_locks JOIN pg_stat_activity USING (pid)
      WHERE NOT granted AND datname = current_database()`,
  );
  return Number(result.rows[0]?.waiting);
}
