import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleService, type Service } from '../../src/bootstrap/assemble-service.ts';
import { testDatabaseUrl } from './test-database-url.ts';

const ZALO_ENVIRONMENT: NodeJS.ProcessEnv = {
  DATABASE_URL: testDatabaseUrl,
  MESSAGING_PROVIDER: 'zalo-oa',
  ZALO_APP_ID: 'app-1',
  ZALO_APP_SECRET: 'sec-1',
  CHANNEL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  PUBLIC_BASE_URL: 'https://x.test',
};

describe('the removed ChatGPT connector routes', () => {
  let service: Service;

  beforeEach(() => {
    service = assembleService(ZALO_ENVIRONMENT, () => {});
  });

  afterEach(async () => {
    await service.server.close();
    await service.pool.end();
  });

  it('answers 404 on the OAuth authorize page', async () => {
    const response = await service.server.inject({ method: 'GET', url: '/oauth/authorize' });

    expect(response.statusCode).toBe(404);
  });
});
