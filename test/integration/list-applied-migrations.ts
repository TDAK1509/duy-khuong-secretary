import type { TemporaryDatabase } from './temporary-database.ts';

export async function listAppliedMigrations(database: TemporaryDatabase): Promise<string[]> {
  const rows = await database.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY id');
  return rows.map((row) => row.name);
}
