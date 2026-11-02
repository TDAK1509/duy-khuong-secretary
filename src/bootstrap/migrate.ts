import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '../providers/database/migration-tool.ts';

export type MigrationCommandOptions = {
  directory: URL;
};

export async function runMigrationCommand(
  environment: NodeJS.ProcessEnv,
  options: MigrationCommandOptions,
): Promise<number> {
  await migrateDatabase({
    databaseUrl: environment['MIGRATION_DATABASE_URL'] ?? '',
    directory: fileURLToPath(options.directory),
  });
  return 0;
}
