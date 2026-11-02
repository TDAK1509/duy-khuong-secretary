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
    ]);
  });
});
