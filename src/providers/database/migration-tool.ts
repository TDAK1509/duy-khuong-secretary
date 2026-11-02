import { setTimeout as sleepFor } from 'node:timers/promises';
import { jiti, runner, type MigrationBuilder, type RunnerOption } from 'node-pg-migrate';
import pg from 'pg';

const APPLICATION_NAME = 'migrate';
const LOCK_NOT_AVAILABLE = '55P03';
const RETRY_DELAY_MS = 2000;
const RETRY_JITTER_RATIO = 0.25;
const MIGRATION_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'];
const TRANSACTION_TIMEOUTS = [
  "SET LOCAL lock_timeout = '1s'",
  "SET LOCAL statement_timeout = '30s'",
];

export type RetryPolicy = {
  budgetMs: number;
  sleep: (milliseconds: number) => Promise<void>;
};

const DEFAULT_RETRY_POLICY: RetryPolicy = { budgetMs: 60_000, sleep: sleepFor };

export type MigrationRun = {
  databaseUrl: string;
  directory: string;
  retry?: Partial<RetryPolicy>;
};

export async function migrateDatabase(run: MigrationRun): Promise<string[]> {
  const retry = { ...DEFAULT_RETRY_POLICY, ...run.retry };
  const startedAt = performance.now();
  for (;;) {
    try {
      return await migrateOnce(run);
    } catch (error) {
      if (!isLockBusy(error)) throw error;
      if (performance.now() - startedAt >= retry.budgetMs) throw giveUp(error, retry.budgetMs);
      await retry.sleep(pickRetryDelayMs());
    }
  }
}

function isLockBusy(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === LOCK_NOT_AVAILABLE;
}

function giveUp(error: unknown, budgetMs: number): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`gave up on busy table locks after ${budgetMs} ms: ${reason}`, { cause: error });
}

function pickRetryDelayMs(): number {
  const jitter = (Math.random() * 2 - 1) * RETRY_JITTER_RATIO;
  return RETRY_DELAY_MS * (1 + jitter);
}

async function migrateOnce(run: MigrationRun): Promise<string[]> {
  const client = new pg.Client({
    connectionString: run.databaseUrl,
    application_name: APPLICATION_NAME,
  });
  client.on('error', () => {});
  await client.connect();
  try {
    return await applyMigrations(client, run.directory);
  } finally {
    await endCleanly(client);
  }
}

async function applyMigrations(client: pg.Client, directory: string): Promise<string[]> {
  const applied = await runner({
    dbClient: client,
    dir: directory,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    singleTransaction: false,
    advisoryLockMode: 'wait',
    migrationLoaderStrategies: [{ extensions: MIGRATION_EXTENSIONS, loader: loadGuardedMigrations }],
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
  return applied.map((migration) => migration.name);
}

async function endCleanly(client: pg.Client): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
  await client.end();
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

function guardMigration(up: AppMigration['up']): (pgm: MigrationBuilder) => void {
  return (pgm) => {
    const { statements, usesTransaction } = record(up);
    if (usesTransaction) TRANSACTION_TIMEOUTS.forEach((timeout) => pgm.sql(timeout));
    else pgm.noTransaction();
    statements.forEach((statement) => pgm.sql(statement));
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
