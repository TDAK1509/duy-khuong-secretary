import { runMigrationCommand } from '../../src/bootstrap/migrate.ts';
import { createTemporaryDatabase, type TemporaryDatabase } from './temporary-database.ts';

const migrationsDirectory = new URL('../../src/app/db/migrations/', import.meta.url);

export async function createMigratedDatabase(creatorUrl?: string): Promise<TemporaryDatabase> {
  const database = await createTemporaryDatabase(creatorUrl);
  const exitCode = await runMigrationCommand(
    { MIGRATION_DATABASE_URL: database.url },
    { directory: migrationsDirectory, log: () => {} },
  );
  if (exitCode !== 0) {
    await database.drop();
    throw new Error('the migrations failed on the temporary database');
  }
  return database;
}
