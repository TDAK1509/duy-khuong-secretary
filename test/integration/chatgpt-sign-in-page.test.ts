import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { QrCodeGeneratorRenderer } from '../../src/providers/qr-code/qrcode-generator-renderer.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { makeSignInQuery, PUBLIC_BASE_URL } from './chatgpt-sign-in-requests.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ENCRYPTION_KEY = 'a'.repeat(64);
const QR_CAPTION = 'Quét bằng Zalo trên điện thoại để mở khung chat với Trợ lý.';

describe('GET /oauth/authorize', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    const tokens = makeTokenPair({ accessToken: 'a1' });
    await storeConnection(pool, { channel: 'zalo-oa', accountId: '1234567890', tokens, storedAt: NOW }, ENCRYPTION_KEY);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('shows the sign-in form for a valid ChatGPT request', async () => {
    const response = await requestSignInPage(makeSignInQuery());

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Mã kết nối');
    expect(await database.query('SELECT id FROM chatgpt_sign_ins')).toHaveLength(1);
    expect(response.headers['set-cookie']).toMatch(/HttpOnly/);
  });

  it('shows a QR code for the Trợ lý chat', async () => {
    const response = await requestSignInPage(makeSignInQuery());

    const expectedSvg = new QrCodeGeneratorRenderer().renderSvg('https://zalo.me/1234567890', QR_CAPTION);
    expect(response.body).toContain(expectedSvg);
    expect(expectedSvg).toContain('role="img"');
  });

  it('opens the Trợ lý chat with the Mở Zalo button', async () => {
    const response = await requestSignInPage(makeSignInQuery());

    expect(response.body).toMatch(/<a [^>]*href="https:\/\/zalo\.me\/1234567890"[^>]*>Mở Zalo<\/a>/);
  });

  it('does not cut a pasted code in the code field', async () => {
    const response = await requestSignInPage(makeSignInQuery());

    const codeField = response.body.match(/<input[^>]*>/)?.[0];
    expect(codeField).toContain('name="code"');
    expect(codeField).not.toMatch(/maxlength/i);
  });

  function requestSignInPage(query: Record<string, string>) {
    const server = buildServer(pool, null, { signIn: { database: pool, clock, publicBaseUrl: PUBLIC_BASE_URL, qrCode: new QrCodeGeneratorRenderer() } });
    return server.inject({ method: 'GET', url: '/oauth/authorize', query });
  }
});
