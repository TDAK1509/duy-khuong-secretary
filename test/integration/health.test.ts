import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool } from '../../src/providers/database/postgres.ts';
import { testDatabaseUrl } from './test-database-url.ts';

const unreachableDatabaseUrl = 'postgres://app_owner:app_owner@127.0.0.1:1/secretary';

describe('GET /health', () => {
  const cleanups: Array<() => Promise<unknown>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it('reports a reachable database', async () => {
    const pool = createPostgresPool(testDatabaseUrl);
    const server = buildServer(pool);
    cleanups.push(() => server.close(), () => pool.end());

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"ok":true}');
  });

  it('reports an unreachable database', async () => {
    const pool = createPostgresPool(unreachableDatabaseUrl);
    const server = buildServer(pool);
    cleanups.push(() => server.close(), () => pool.end());

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.body).toBe('{"ok":false}');
  });
});
