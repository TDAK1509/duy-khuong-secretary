import { z } from 'zod';
import { countRecordsWithoutNumbers } from '../app/records/count-records-without-numbers.ts';
import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import type { ReaderService } from '../services/reading/reader-service.ts';
import { readRuntimeDatabaseUrl } from './config.ts';
import { loadReaderConfig, type ReaderConfig } from './reader-config.ts';

const USAGE = 'Usage: node dist/bootstrap/backfill-detail-numbers.js <workspace-uuid> [--apply]';

export type BackfillDetailNumbersOptions = {
  log?: (line: string) => void;
  buildReader?: (config: ReaderConfig) => ReaderService;
};

type BackfillArguments = { workspaceId: string; apply: boolean };

export async function runBackfillDetailNumbersCommand(
  args: string[],
  environment: NodeJS.ProcessEnv,
  options: BackfillDetailNumbersOptions = {},
): Promise<number> {
  const log = options.log ?? console.log;
  const databaseUrl = z.url().safeParse(readRuntimeDatabaseUrl(environment));
  if (!databaseUrl.success) {
    log('DATABASE_URL must be set to a database URL');
    return 1;
  }
  const parsedArguments = parseArguments(args);
  if (parsedArguments === null) {
    log(USAGE);
    return 1;
  }
  const readerConfig = loadReaderConfig(environment);
  if (parsedArguments.apply && !readerConfig.ok) {
    log(`Missing reader settings: ${readerConfig.missing.join(', ')}`);
    return 1;
  }
  const pool = createPostgresPool(databaseUrl.data);
  try {
    return await reportRecordsWithoutNumbers(pool, parsedArguments.workspaceId, log);
  } finally {
    await pool.end();
  }
}

function parseArguments(args: string[]): BackfillArguments | null {
  const [workspaceId, ...flags] = args;
  const parsedId = z.uuid().safeParse(workspaceId);
  const apply = flags.length === 1 && flags[0] === '--apply';
  if (!parsedId.success || (flags.length > 0 && !apply)) return null;
  return { workspaceId: parsedId.data, apply };
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
