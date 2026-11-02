import type { PostgresPool } from '../../providers/database/postgres.ts';

export async function pingDatabase(pool: PostgresPool): Promise<void> {
  await pool.query('SELECT 1');
}
