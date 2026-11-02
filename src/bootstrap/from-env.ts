import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import type { Config } from './config.ts';

export type Providers = {
  pool: PostgresPool;
};

export function buildProvidersFromConfig(config: Config): Providers {
  return { pool: createPostgresPool(config.databaseUrl) };
}
