import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '../providers/database/migration-tool.ts';

export type MigrationCommandOptions = {
  directory: URL;
  log?: (line: string) => void;
};

export async function runMigrationCommand(
  environment: NodeJS.ProcessEnv,
  options: MigrationCommandOptions,
): Promise<number> {
  const log = options.log ?? console.log;
  const applied = await migrateDatabase({
    databaseUrl: environment['MIGRATION_DATABASE_URL'] ?? '',
    directory: fileURLToPath(options.directory),
  });
  log(describeApplied(applied));
  return 0;
}

function describeApplied(applied: string[]): string {
  return applied.length === 0
    ? '[migrate] nothing to apply'
    : `[migrate] applied: ${applied.join(', ')}`;
}
