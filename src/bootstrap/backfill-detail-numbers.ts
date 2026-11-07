import { z } from 'zod';
import { readRuntimeDatabaseUrl } from './config.ts';

export type BackfillDetailNumbersOptions = {
  log?: (line: string) => void;
};

export async function runBackfillDetailNumbersCommand(
  _args: string[],
  environment: NodeJS.ProcessEnv,
  options: BackfillDetailNumbersOptions = {},
): Promise<number> {
  const log = options.log ?? console.log;
  const databaseUrl = z.url().safeParse(readRuntimeDatabaseUrl(environment));
  if (!databaseUrl.success) {
    log('DATABASE_URL must be set to a database URL');
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runBackfillDetailNumbersCommand(process.argv.slice(2), process.env);
}
