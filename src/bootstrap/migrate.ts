import { fileURLToPath } from 'node:url';
import {
  migrateDatabase,
  type MigrationOutcome,
  type RetryPolicy,
} from '../providers/database/migration-tool.ts';

export type MigrationCommandOptions = {
  directory: URL;
  log?: (line: string) => void;
  retry?: Partial<RetryPolicy>;
};

export async function runMigrationCommand(
  environment: NodeJS.ProcessEnv,
  options: MigrationCommandOptions,
): Promise<number> {
  const log = options.log ?? console.log;
  try {
    const outcome = await migrateDatabase({
      databaseUrl: environment['MIGRATION_DATABASE_URL'] ?? '',
      directory: fileURLToPath(options.directory),
      retry: options.retry,
    });
    log(describeOutcome(outcome));
    return 0;
  } catch (error) {
    log(`[migrate] failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function describeOutcome(outcome: MigrationOutcome): string {
  if (outcome.kind === 'database-ahead') {
    return '[migrate] database is ahead of this build (rollback); skipping migrations';
  }
  return outcome.names.length === 0
    ? '[migrate] nothing to apply'
    : `[migrate] applied: ${outcome.names.join(', ')}`;
}
