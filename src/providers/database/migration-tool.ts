import { runner } from 'node-pg-migrate';

export type MigrationRun = {
  databaseUrl: string;
  directory: string;
};

export async function migrateDatabase(run: MigrationRun): Promise<string[]> {
  const applied = await runner({
    databaseUrl: run.databaseUrl,
    dir: run.directory,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    singleTransaction: false,
    advisoryLockMode: 'wait',
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
  return applied.map((migration) => migration.name);
}
