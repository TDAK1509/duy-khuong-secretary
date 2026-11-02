import pg from 'pg';

export type PostgresPool = pg.Pool;

export type PostgresTimeouts = {
  queryTimeoutMs: number;
  statementTimeoutMs: number;
};

const CONNECTION_TIMEOUT_MS = 2000;
const DEFAULT_TIMEOUTS: PostgresTimeouts = { queryTimeoutMs: 5000, statementTimeoutMs: 4000 };

export function createPostgresPool(
  databaseUrl: string,
  timeouts: PostgresTimeouts = DEFAULT_TIMEOUTS,
): PostgresPool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    query_timeout: timeouts.queryTimeoutMs,
    statement_timeout: timeouts.statementTimeoutMs,
  });
  pool.on('error', (error) => console.error('[postgres] idle client error:', error.message));
  return pool;
}
