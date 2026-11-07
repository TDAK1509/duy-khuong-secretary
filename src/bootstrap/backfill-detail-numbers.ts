import { z } from 'zod';
import { backfillDetailNumbers } from '../app/records/backfill-detail-numbers.ts';
import { countRecordsWithoutNumbers } from '../app/records/records-without-numbers.ts';
import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import type { ReaderService } from '../services/reading/reader-service.ts';
import { readRuntimeDatabaseUrl } from './config.ts';
import { buildReader } from './from-env.ts';
import { loadReaderConfig, type ReaderConfig } from './reader-config.ts';

const USAGE = 'Usage: node dist/bootstrap/backfill-detail-numbers.js <workspace-uuid> [--apply]';

export type BackfillDetailNumbersOptions = {
  log?: (line: string) => void;
  buildReader?: (config: ReaderConfig) => ReaderService;
};

type BackfillArguments = { workspaceId: string; apply: boolean };

type BackfillSetup =
  | { problem: string }
  | { databaseUrl: string; workspaceId: string; reader: ReaderService | null };

export async function runBackfillDetailNumbersCommand(
  args: string[],
  environment: NodeJS.ProcessEnv,
  options: BackfillDetailNumbersOptions = {},
): Promise<number> {
  const log = options.log ?? console.log;
  const setup = readSetup(args, environment, options.buildReader ?? buildReader);
  if ('problem' in setup) {
    log(setup.problem);
    return 1;
  }
  const pool = createPostgresPool(setup.databaseUrl);
  try {
    return await runBackfill(pool, setup.workspaceId, setup.reader, log);
  } finally {
    await pool.end();
  }
}

function readSetup(
  args: string[],
  environment: NodeJS.ProcessEnv,
  buildReaderFrom: (config: ReaderConfig) => ReaderService,
): BackfillSetup {
  const databaseUrl = z.url().safeParse(readRuntimeDatabaseUrl(environment));
  if (!databaseUrl.success) return { problem: 'DATABASE_URL must be set to a database URL' };
  const parsedArguments = parseArguments(args);
  if (parsedArguments === null) return { problem: USAGE };
  const readerConfig = parsedArguments.apply ? loadReaderConfig(environment) : null;
  if (readerConfig?.ok === false) return { problem: `Missing reader settings: ${readerConfig.missing.join(', ')}` };
  const reader = readerConfig === null ? null : buildReaderFrom(readerConfig.config);
  return { databaseUrl: databaseUrl.data, workspaceId: parsedArguments.workspaceId, reader };
}

function parseArguments(args: string[]): BackfillArguments | null {
  const [workspaceId, ...flags] = args;
  const parsedId = z.uuid().safeParse(workspaceId);
  const apply = flags.length === 1 && flags[0] === '--apply';
  if (!parsedId.success || (flags.length > 0 && !apply)) return null;
  return { workspaceId: parsedId.data, apply };
}

async function runBackfill(
  pool: PostgresPool,
  workspaceId: string,
  reader: ReaderService | null,
  log: (line: string) => void,
): Promise<number> {
  if (reader === null) return reportRecordsWithoutNumbers(pool, workspaceId, log);
  const summary = await backfillDetailNumbers(pool, reader, workspaceId);
  for (const failure of summary.failures) log(`Failed record ${failure.recordId}: ${failure.reason}`);
  log(`Checked ${summary.checked} records. Added numbers to ${summary.added}. Failed ${summary.failures.length}.`);
  return summary.failures.length === 0 ? 0 : 1;
}

async function reportRecordsWithoutNumbers(
  pool: PostgresPool,
  workspaceId: string,
  log: (line: string) => void,
): Promise<number> {
  const total = await countRecordsWithoutNumbers(pool, workspaceId);
  log(`Records without numbers in workspace ${workspaceId}: ${total}. Nothing changed. Run again with --apply to add numbers.`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runBackfillDetailNumbersCommand(process.argv.slice(2), process.env);
}
