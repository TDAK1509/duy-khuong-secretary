import { afterEach, describe, expect, it } from 'vitest';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { testDatabaseUrl } from './test-database-url.ts';

describe('createPostgresPool', () => {
  const pools: PostgresPool[] = [];

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it('gives up on a query that stays unanswered and frees its connection', async () => {
    const pool = createPostgresPool(testDatabaseUrl, {
      queryTimeoutMs: 200,
      statementTimeoutMs: 10_000,
    });
    pools.push(pool);

    const startedAt = Date.now();
    await expect(pool.query('SELECT pg_sleep(3)')).rejects.toThrow(/timeout/i);

    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(pool.totalCount).toBe(0);
  });
});
