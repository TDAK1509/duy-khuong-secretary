import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleepFor } from 'node:timers/promises';
import { PG_MIGRATE_LOCK_ID, jiti, runner, type MigrationBuilder, type RunnerOption } from 'node-pg-migrate';
import pg from 'pg';

const APPLICATION_NAME = 'migrate';
const LOCK_NOT_AVAILABLE = '55P03';
const CONNECTION_TIMEOUT_MESSAGE = 'timeout expired';
const RETRY_DELAY_MS = 2000;
const RETRY_JITTER_RATIO = 0.25;
const MIGRATION_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'];
const IDENTIFIER = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
const INDEX_BUILD = new RegExp(
  String.raw`CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+(?:IF\s+NOT\s+EXISTS\s+)?(${IDENTIFIER}(?:\.${IDENTIFIER})?)`,
  'gi',
);
const BUILD_STATEMENT_TIMEOUT = "SET statement_timeout = '10min'";
const RESET_STATEMENT_TIMEOUT = 'RESET statement_timeout';
const TRANSACTION_TIMEOUTS = [
  "SET LOCAL lock_timeout = '1s'",
  "SET LOCAL statement_timeout = '30s'",
];

export type RetryPolicy = {
  budgetMs: number;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
};

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  budgetMs: 60_000,
  now: () => performance.now(),
  sleep: sleepFor,
};

export type MigrationRun = {
  databaseUrl: string;
  directory: string;
  retry?: Partial<RetryPolicy>;
};

export type MigrationOutcome = { kind: 'applied'; names: string[] } | { kind: 'database-ahead' };

export async function migrateDatabase(run: MigrationRun): Promise<MigrationOutcome> {
  const retry = { ...DEFAULT_RETRY_POLICY, ...run.retry };
  const deadline = retry.now() + retry.budgetMs;
  let lastBusy: unknown;
  for (;;) {
    try {
      return await migrateOnce(run, budgetOf(retry, deadline));
    } catch (error) {
      if (error instanceof BudgetUsedUp) throw giveUp(lastBusy ?? error, retry.budgetMs);
      if (!isLockBusy(error)) throw error;
      lastBusy = error;
      await sleepWithinBudget(retry, deadline, error);
    }
  }
}

class BudgetUsedUp extends Error {}

type Budget = { totalMs: number; remainingMs: () => number };

async function migrateOnce(run: MigrationRun, budget: Budget): Promise<MigrationOutcome> {
  const client = new pg.Client({
    connectionString: run.databaseUrl,
    application_name: APPLICATION_NAME,
    connectionTimeoutMillis: takeRemainingMs(budget),
  });
  client.on('error', () => {});
  await connectWithinBudget(client);
  try {
    return await applyMigrations(client, run.directory, budget);
  } finally {
    await endCleanly(client);
  }
}

async function connectWithinBudget(client: pg.Client): Promise<void> {
  try {
    await client.connect();
  } catch (error) {
    if (error instanceof Error && error.message === CONNECTION_TIMEOUT_MESSAGE) {
      throw new BudgetUsedUp(error.message, { cause: error });
    }
    throw error;
  }
}

async function endCleanly(client: pg.Client): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
  await client.end();
}

async function applyMigrations(
  client: pg.Client,
  directory: string,
  budget: Budget,
): Promise<MigrationOutcome> {
  await takeMigrationLock(client, takeRemainingMs(budget));
  if (await isDatabaseAhead(client, directory)) return { kind: 'database-ahead' };
  const applied = await runner({
    dbClient: client,
    dir: directory,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    singleTransaction: false,
    noLock: true,
    migrationLoaderStrategies: [{ extensions: MIGRATION_EXTENSIONS, loader: loadGuardedMigrations }],
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
  return { kind: 'applied', names: applied.map((migration) => migration.name) };
}

async function takeMigrationLock(client: pg.Client, waitMs: number): Promise<void> {
  await client.query(`SET lock_timeout = ${waitMs}`);
  await client.query('SELECT pg_advisory_lock($1)', [PG_MIGRATE_LOCK_ID]);
  await client.query('RESET lock_timeout');
}

async function isDatabaseAhead(client: pg.Client, directory: string): Promise<boolean> {
  const known = new Set(await listMigrationNames(directory));
  const recorded = await listRecordedMigrationNames(client);
  return recorded.some((name) => !known.has(name));
}

async function listMigrationNames(directory: string): Promise<string[]> {
  const files = await readdir(directory);
  return files
    .filter((file) => !file.startsWith('.') && MIGRATION_EXTENSIONS.includes(path.extname(file)))
    .map((file) => path.basename(file, path.extname(file)));
}

async function listRecordedMigrationNames(client: pg.Client): Promise<string[]> {
  const table = await client.query("SELECT to_regclass('pgmigrations') IS NOT NULL AS found");
  if (!table.rows[0]?.found) return [];
  const recorded = await client.query<{ name: string }>('SELECT name FROM pgmigrations');
  return recorded.rows.map((row) => row.name);
}

type MigrationLoader = Exclude<
  NonNullable<RunnerOption['migrationLoaderStrategies']>[number]['loader'],
  string
>;

type AppMigrationBuilder = {
  sql(statement: string): void;
  noTransaction(): void;
};

type AppMigration = { up: (pgm: AppMigrationBuilder) => void };

const loadGuardedMigrations: MigrationLoader = (filePaths) =>
  Promise.all(
    filePaths.map(async (filePath) => {
      const migration = await jiti.import<AppMigration>(filePath);
      return {
        id: filePath,
        filePaths: [filePath],
        actions: { up: guardMigration(migration.up), down: false as const },
      };
    }),
  );

type Recording = { statements: string[]; usesTransaction: boolean };

function guardMigration(up: AppMigration['up']): (pgm: MigrationBuilder) => Promise<void> {
  return async (pgm) => {
    const { statements, usesTransaction } = record(up);
    if (usesTransaction) guardTransaction(pgm, statements);
    else await guardBuild(pgm, statements);
  };
}

function record(up: AppMigration['up']): Recording {
  const recording: Recording = { statements: [], usesTransaction: true };
  up({
    sql: (statement) => recording.statements.push(statement),
    noTransaction: () => {
      recording.usesTransaction = false;
    },
  });
  return recording;
}

function guardTransaction(pgm: MigrationBuilder, statements: string[]): void {
  TRANSACTION_TIMEOUTS.forEach((timeout) => pgm.sql(timeout));
  statements.forEach((statement) => pgm.sql(statement));
}

async function guardBuild(pgm: MigrationBuilder, statements: string[]): Promise<void> {
  pgm.noTransaction();
  await dropInvalidIndexes(pgm.db, statements);
  pgm.sql(BUILD_STATEMENT_TIMEOUT);
  statements.forEach((statement) => pgm.sql(statement));
  pgm.sql(RESET_STATEMENT_TIMEOUT);
}

async function dropInvalidIndexes(db: MigrationBuilder['db'], statements: string[]): Promise<void> {
  for (const indexName of listBuiltIndexNames(statements)) {
    if (await isInvalidIndex(db, indexName)) await dropIndex(db, indexName);
  }
}

async function dropIndex(db: MigrationBuilder['db'], indexName: string): Promise<void> {
  await db.query(BUILD_STATEMENT_TIMEOUT);
  await db.query(`DROP INDEX CONCURRENTLY ${indexName}`);
}

function listBuiltIndexNames(statements: string[]): string[] {
  return statements.flatMap((statement) =>
    [...statement.matchAll(INDEX_BUILD)].map((match) => match[1] ?? ''),
  );
}

async function isInvalidIndex(db: MigrationBuilder['db'], indexName: string): Promise<boolean> {
  const rows = await db.select(
    'SELECT NOT indisvalid AS is_invalid FROM pg_index WHERE indexrelid = to_regclass($1)',
    [indexName],
  );
  return rows[0]?.is_invalid === true;
}

async function sleepWithinBudget(retry: RetryPolicy, deadline: number, busy: unknown): Promise<void> {
  const remainingMs = deadline - retry.now();
  if (remainingMs <= 0) throw giveUp(busy, retry.budgetMs);
  await retry.sleep(Math.min(pickRetryDelayMs(), remainingMs));
  if (deadline - retry.now() <= 0) throw giveUp(busy, retry.budgetMs);
}

function budgetOf(retry: RetryPolicy, deadline: number): Budget {
  return { totalMs: retry.budgetMs, remainingMs: () => deadline - retry.now() };
}

function takeRemainingMs(budget: Budget): number {
  const remainingMs = Math.floor(budget.remainingMs());
  if (remainingMs <= 0) throw new BudgetUsedUp('no time left in the budget');
  return remainingMs;
}

function isLockBusy(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === LOCK_NOT_AVAILABLE;
}

function giveUp(error: unknown, budgetMs: number): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`gave up waiting for locks after ${budgetMs} ms: ${reason}`, { cause: error });
}

function pickRetryDelayMs(): number {
  const jitter = (Math.random() * 2 - 1) * RETRY_JITTER_RATIO;
  return Math.round(RETRY_DELAY_MS * (1 + jitter));
}
