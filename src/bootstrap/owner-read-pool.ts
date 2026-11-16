import pg from 'pg';
import type { PostgresPool } from '../providers/database/postgres.ts';

const CONNECTION_TIMEOUT_MS = 2000;
const STATEMENT_TIMEOUT_MS = 30_000;

export function createOwnerReadPool(migrationDatabaseUrl: string): PostgresPool {
  const pool = new pg.Pool({
    connectionString: migrationDatabaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });
  pool.on('connect', (client) => {
    void client.query("SET default_transaction_read_only = on");
  });
  pool.on('error', (error) => console.error('[owner-read-pool] idle client error:', error.message));
  return pool;
}
