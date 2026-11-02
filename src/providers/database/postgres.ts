import pg from 'pg';

export type PostgresPool = pg.Pool;

const CONNECTION_TIMEOUT_MS = 2000;

export function createPostgresPool(databaseUrl: string): PostgresPool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  pool.on('error', (error) => console.error('[postgres] idle client error:', error.message));
  return pool;
}
