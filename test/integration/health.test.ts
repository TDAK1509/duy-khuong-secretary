import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/bootstrap/config.ts';
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
    const server = buildServer(pool, null);
    cleanups.push(() => server.close(), () => pool.end());

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"ok":true,"commit":null}');
  });

  it('reports an unreachable database', async () => {
    const pool = createPostgresPool(unreachableDatabaseUrl);
    const server = buildServer(pool, null);
    cleanups.push(() => server.close(), () => pool.end());

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.body).toBe('{"ok":false,"commit":null}');
  });

  it('reports the commit from GIT_COMMIT', async () => {
    const config = loadConfig({
      DATABASE_URL: testDatabaseUrl,
      GIT_COMMIT: 'abc123',
      RENDER_GIT_COMMIT: 'def456',
    });
    const pool = createPostgresPool(config.databaseUrl);
    const server = buildServer(pool, config.commit);
    cleanups.push(() => server.close(), () => pool.end());

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({ ok: true, commit: 'abc123' });
  });

  it('falls back to the commit Render sets', async () => {
    const config = loadConfig({ DATABASE_URL: testDatabaseUrl, RENDER_GIT_COMMIT: 'def456' });
    const pool = createPostgresPool(config.databaseUrl);
    const server = buildServer(pool, config.commit);
    cleanups.push(() => server.close(), () => pool.end());

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({ ok: true, commit: 'def456' });
  });

  it('reports no commit when none is set', async () => {
    const config = loadConfig({ DATABASE_URL: testDatabaseUrl });
    const pool = createPostgresPool(config.databaseUrl);
    const server = buildServer(pool, config.commit);
    cleanups.push(() => server.close(), () => pool.end());

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({ ok: true, commit: null });
  });
});
