import { afterEach, describe, expect, it } from 'vitest';
import { assembleService, type Service } from '../../src/bootstrap/assemble-service.ts';
import { CHAT_OFF_LINE, PHOTOS_OFF_LINE, READERS_OFF_LINE } from './off-group-lines.ts';
import { testDatabaseUrl } from './test-database-url.ts';

const PHOTO_ENVIRONMENT: NodeJS.ProcessEnv = {
  PHOTO_STORAGE: 's3',
  S3_ENDPOINT: 'https://r2.test',
  S3_REGION: 'auto',
  S3_BUCKET: 'photos',
  S3_ACCESS_KEY_ID: 'key-id',
  S3_SECRET_ACCESS_KEY: 'secret',
};

const READER_ENVIRONMENT: NodeJS.ProcessEnv = {
  READER_PROVIDER: 'openai-compatible',
  ...Object.fromEntries(
    ['CHEAP_1', 'CHEAP_2', 'STRONG_1', 'STRONG_2'].flatMap((slot) => [
      [`READER_${slot}_BASE_URL`, 'https://ai.test/v1'],
      [`READER_${slot}_API_KEY`, 'key'],
      [`READER_${slot}_MODEL`, 'model'],
    ]),
  ),
};

const CHAT_ENVIRONMENT: NodeJS.ProcessEnv = {
  CHAT_PROVIDER: 'openai-compatible',
  LLM_BASE_URL: 'https://ai.test/v1',
  LLM_API_KEY: 'key',
  LLM_MODEL: 'model',
};

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
      PHOTOS_OFF_LINE,
      READERS_OFF_LINE,
      CHAT_OFF_LINE,
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
        ...PHOTO_ENVIRONMENT,
        ...READER_ENVIRONMENT,
        ...CHAT_ENVIRONMENT,
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
