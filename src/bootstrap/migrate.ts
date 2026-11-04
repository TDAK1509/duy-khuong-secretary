import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  migrateDatabase,
  type MigrationOutcome,
  type RetryPolicy,
} from '../providers/database/migration-tool.ts';
import { setRolePassword } from '../providers/database/set-role-password.ts';
import { RUNTIME_ROLE } from './config.ts';

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
  const databaseUrl = z.url().safeParse(environment['MIGRATION_DATABASE_URL']);
  if (!databaseUrl.success) {
    return fail(log, 'MIGRATION_DATABASE_URL must be set to a database URL');
  }
  const migrated = await migrateAndLog(databaseUrl.data, options, log);
  const password = environment['APP_RUNTIME_PASSWORD'];
  if (migrated !== 0 || !password) return migrated;
  return setRuntimePassword(databaseUrl.data, password, log);
}

async function migrateAndLog(
  databaseUrl: string,
  options: MigrationCommandOptions,
  log: (line: string) => void,
): Promise<number> {
  try {
    const directory = fileURLToPath(options.directory);
    log(describeOutcome(await migrateDatabase({ databaseUrl, directory, retry: options.retry })));
    return 0;
  } catch (error) {
    return fail(log, error instanceof Error ? error.message : String(error));
  }
}

async function setRuntimePassword(
  databaseUrl: string,
  password: string,
  log: (line: string) => void,
): Promise<number> {
  try {
    await setRolePassword({ databaseUrl, role: RUNTIME_ROLE, password });
    log(`[migrate] ${RUNTIME_ROLE} password set`);
    return 0;
  } catch (error) {
    return fail(log, `could not set the ${RUNTIME_ROLE} password (SQLSTATE ${readSqlState(error)})`);
  }
}

function readSqlState(error: unknown): string {
  return error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
}

function fail(log: (line: string) => void, reason: string): number {
  log(`[migrate] failed: ${reason}`);
  return 1;
}

function describeOutcome(outcome: MigrationOutcome): string {
  if (outcome.kind === 'database-ahead') {
    return '[migrate] database is ahead of this build (rollback); skipping migrations';
  }
  return outcome.names.length === 0
    ? '[migrate] nothing to apply'
    : `[migrate] applied: ${outcome.names.join(', ')}`;
}

if (import.meta.main) {
  const migrationsDirectory = new URL('../app/db/migrations/', import.meta.url);
  process.exitCode = await runMigrationCommand(process.env, { directory: migrationsDirectory });
}
