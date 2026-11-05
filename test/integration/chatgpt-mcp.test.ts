import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { McpDependencies } from '../../src/app/http/chatgpt-mcp.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { PUBLIC_BASE_URL } from './chatgpt-sign-in-requests.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const INITIALIZE_REQUEST = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt', version: '1.0.0' } },
};

describe('the MCP address', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('challenges a request without a token to sign in', async () => {
    const response = await postMcp(INITIALIZE_REQUEST);

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe(
      'Bearer resource_metadata="https://generator-24.com/.well-known/oauth-protected-resource"',
    );
  });

  it('answers 503 while Zalo is off', async () => {
    const response = await postMcp(INITIALIZE_REQUEST, null);

    expect(response.statusCode).toBe(503);
  });

  it('publishes the protected resource metadata', async () => {
    const server = buildServer(pool, null, { chatgptMcp: { publicBaseUrl: PUBLIC_BASE_URL } });

    const response = await server.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      resource: 'https://generator-24.com/mcp',
      authorization_servers: ['https://generator-24.com'],
      bearer_methods_supported: ['header'],
      resource_name: 'Trợ lý',
    });
  });

  function postMcp(body: unknown, chatgptMcp: McpDependencies | null = { publicBaseUrl: PUBLIC_BASE_URL }) {
    const server = buildServer(pool, null, { chatgptMcp });
    return server.inject({ method: 'POST', url: '/mcp', headers: { 'content-type': 'application/json' }, payload: JSON.stringify(body) });
  }
});
