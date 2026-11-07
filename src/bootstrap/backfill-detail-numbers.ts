import { z } from 'zod';
import { readRuntimeDatabaseUrl } from './config.ts';

const USAGE = 'Usage: node dist/bootstrap/backfill-detail-numbers.js <workspace-uuid> [--apply]';

export type BackfillDetailNumbersOptions = {
  log?: (line: string) => void;
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
  if (parseArguments(args) === null) {
    log(USAGE);
    return 1;
  }
  return 0;
}

function parseArguments(args: string[]): BackfillArguments | null {
  const [workspaceId, ...flags] = args;
  const parsedId = z.uuid().safeParse(workspaceId);
  const apply = flags.length === 1 && flags[0] === '--apply';
  if (!parsedId.success || (flags.length > 0 && !apply)) return null;
  return { workspaceId: parsedId.data, apply };
}

if (import.meta.main) {
  process.exitCode = await runBackfillDetailNumbersCommand(process.argv.slice(2), process.env);
}
