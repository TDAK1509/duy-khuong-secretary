import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { QrCodeGeneratorRenderer } from '../../src/providers/qr-code/qrcode-generator-renderer.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { PUBLIC_BASE_URL } from './chatgpt-sign-in-requests.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');

describe('GET /.well-known/oauth-authorization-server', () => {
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

  it('publishes the OAuth metadata of the service', async () => {
    const server = buildServer(pool, null, {
      signIn: { database: pool, clock: new FakeClock(NOW), publicBaseUrl: PUBLIC_BASE_URL, qrCode: new QrCodeGeneratorRenderer() },
    });

    const response = await server.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      issuer: 'https://generator-24.com',
      authorization_endpoint: 'https://generator-24.com/oauth/authorize',
      token_endpoint: 'https://generator-24.com/oauth/token',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  it('answers 503 while Zalo is off', async () => {
    const response = await buildServer(pool, null).inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' });

    expect(response.statusCode).toBe(503);
  });
});
