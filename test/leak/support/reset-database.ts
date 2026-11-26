import { readFile } from 'node:fs/promises';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';

const SEED_FILE = new URL('./seed.sql', import.meta.url);

export async function resetDatabase(owner: PostgresPool): Promise<void> {
  const seed = await readFile(SEED_FILE, 'utf8');
  const tables = await listTablesToEmpty(owner);
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query(`TRUNCATE ${tables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`);
    await client.query(seed);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listTablesToEmpty(owner: PostgresPool): Promise<string[]> {
  const { rows } = await owner.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'pgmigrations' ORDER BY tablename`,
  );
  return rows.map((row) => row.tablename);
}
