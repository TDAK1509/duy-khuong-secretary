import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, type ServerOptions } from '../../src/bootstrap/server.ts';
import { createPostgresPool } from '../../src/providers/database/postgres.ts';
import { testDatabaseUrl } from './test-database-url.ts';

describe('the Zalo domain verification file', () => {
  const cleanups: Array<() => Promise<unknown>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it('is served when configured', async () => {
    const response = await getVerifierPath({
      verifierFile: { fileName: 'zalo_verifierABC.html', content: '<html>abc</html>' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toBe('<html>abc</html>');
  });

  async function getVerifierPath(options: ServerOptions) {
    const pool = createPostgresPool(testDatabaseUrl);
    const server = buildServer(pool, null, options);
    cleanups.push(() => server.close(), () => pool.end());
    return server.inject({ method: 'GET', url: '/zalo_verifierABC.html' });
  }
});
