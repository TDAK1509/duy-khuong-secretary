import { afterEach, describe, expect, it } from 'vitest';
import { assembleService, type Service } from '../../src/bootstrap/assemble-service.ts';
import { testDatabaseUrl } from './test-database-url.ts';

describe('assembling the service', () => {
  let service: Service;

  afterEach(async () => {
    await service.server.close();
    await service.pool.end();
  });

  it('starts with Zalo off and logs the missing values', async () => {
    const lines: string[] = [];

    service = assembleService({ DATABASE_URL: testDatabaseUrl }, (line) => lines.push(line));

    const response = await service.server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(lines).toEqual([
      '[config] zalo is off; missing: MESSAGING_PROVIDER, ZALO_APP_ID, ZALO_APP_SECRET, CHANNEL_TOKEN_ENCRYPTION_KEY, PUBLIC_BASE_URL.',
      '[config] zalo-webhook is off; missing: MESSAGING_PROVIDER, ZALO_APP_ID, ZALO_APP_SECRET, CHANNEL_TOKEN_ENCRYPTION_KEY, PUBLIC_BASE_URL, ZALO_OA_SECRET.',
    ]);
  });

  it('serves the Zalo callback and logs nothing when Zalo is configured', async () => {
    const lines: string[] = [];

    service = assembleService(
      {
        DATABASE_URL: testDatabaseUrl,
        MESSAGING_PROVIDER: 'zalo-oa',
        ZALO_APP_ID: 'app-1',
        ZALO_APP_SECRET: 'sec-1',
        CHANNEL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
        PUBLIC_BASE_URL: 'https://x.test',
        ZALO_OA_SECRET: 'oa-sec-1',
      },
      (line) => lines.push(line),
    );

    const response = await service.server.inject({
      method: 'GET',
      url: '/oauth/zalo/callback?oa_id=oa-1&code=x&state=bad',
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('Zalo connection failed. Run connect-zalo again.');
    expect(lines).toEqual([]);
  });
});
