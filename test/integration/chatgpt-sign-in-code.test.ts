import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashSecretToken } from '../../src/app/chatgpt/secret-token.ts';
import { removeMember } from '../../src/app/workspaces/remove-member.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { QrCodeGeneratorRenderer } from '../../src/providers/qr-code/qrcode-generator-renderer.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertLoginCode } from './chatgpt-login-code-rows.ts';
import { CHATGPT_REDIRECT_URI, makeSignInQuery, PUBLIC_BASE_URL } from './chatgpt-sign-in-requests.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ENCRYPTION_KEY = 'a'.repeat(64);
const ONE_MINUTE_MS = 60 * 1000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;

describe('POST /oauth/authorize', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let workspaceId: string;
  let duyUserId: string;
  let browserCookie: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    const tokens = makeTokenPair({ accessToken: 'a1' });
    await storeConnection(pool, { channel: 'zalo-oa', accountId: '1234567890', tokens, storedAt: NOW }, ENCRYPTION_KEY);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    browserCookie = await openSignIn();
    await insertLoginCode(database, { userId: duyUserId, code: 'K7M2-QX4P', expiresAt: new Date(NOW.getTime() + FIVE_MINUTES_MS) });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('sends the browser back to ChatGPT after a code typed with a space and in lower case', async () => {
    const response = await submitCode('k7m2 qx4p');

    expect(response.statusCode).toBe(303);
    const location = new URL(String(response.headers['location']));
    expect(`${location.origin}${location.pathname}`).toBe(CHATGPT_REDIRECT_URI);
    expect(location.searchParams.get('code')).toBeTruthy();
    expect(location.searchParams.get('state')).toBe('test1');
    expect(location.searchParams.get('iss')).toBe(PUBLIC_BASE_URL);
  });

  it('binds the sign-in to the admin and uses up the login code', async () => {
    const response = await submitCode('K7M2-QX4P');

    const authorizationCode = new URL(String(response.headers['location'])).searchParams.get('code') ?? '';
    const [membership] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${duyUserId}'`);
    expect(await database.query('SELECT membership_id, authorization_code_hash FROM chatgpt_sign_ins')).toEqual([
      { membership_id: membership?.id, authorization_code_hash: hashSecretToken(authorizationCode) },
    ]);
    expect(await database.query('SELECT user_id FROM chatgpt_login_codes')).toEqual([]);
  });

  it('accepts a pasted code with a line break and spaces around it', async () => {
    const response = await submitCode(' K7M2\nQX4P ');

    expect(response.statusCode).toBe(303);
    expect(String(response.headers['location'])).toContain(CHATGPT_REDIRECT_URI);
  });

  it('counts one failed attempt for a wrong code', async () => {
    const response = await submitCode('AAAA-AAAA');

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Mã không đúng hoặc đã hết hạn. Nhắn "đăng nhập" cho Trợ lý để lấy mã mới.');
    expect(await database.query('SELECT failed_attempts FROM chatgpt_sign_ins')).toEqual([{ failed_attempts: 1 }]);
  });

  it('counts no attempt for a pasted text that is not a code', async () => {
    const response = await submitCode(
      'Mã kết nối ChatGPT của bạn ở tin nhắn tiếp theo. Nhấn giữ tin nhắn đó để sao chép, rồi dán vào trang kết nối ChatGPT của chính bạn.',
    );

    expect(response.body).toContain('Mã không đúng hoặc đã hết hạn.');
    expect(await database.query('SELECT failed_attempts FROM chatgpt_sign_ins')).toEqual([{ failed_attempts: 0 }]);
  });

  it('refuses a correct code after five wrong ones', async () => {
    await database.query('UPDATE chatgpt_sign_ins SET failed_attempts = 5');

    const response = await submitCode('K7M2-QX4P');

    expect(response.body).toContain('Bạn đã nhập sai quá nhiều lần. Hãy bắt đầu lại từ ChatGPT.');
    expect(await database.query('SELECT authorization_code_hash FROM chatgpt_sign_ins')).toEqual([{ authorization_code_hash: null }]);
  });

  it('refuses a login code created 11 minutes ago', async () => {
    await database.query('DELETE FROM chatgpt_login_codes');
    await insertLoginCode(database, { userId: duyUserId, code: 'K7M2-QX4P', expiresAt: new Date(NOW.getTime() - ONE_MINUTE_MS) });

    const response = await submitCode('K7M2-QX4P');

    expect(response.body).toContain('Mã không đúng hoặc đã hết hạn.');
    expect(await database.query('SELECT authorization_code_hash FROM chatgpt_sign_ins')).toEqual([{ authorization_code_hash: null }]);
  });

  it('refuses the code of an admin who was removed', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan', role: 'admin' });
    const [duy] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${duyUserId}'`);
    await removeMember(pool, { workspaceId, callerUserId: lanUserId, membershipId: duy?.id ?? '' });

    const response = await submitCode('K7M2-QX4P');

    expect(response.body).toContain('Mã không đúng hoặc đã hết hạn.');
    expect(await database.query('SELECT authorization_code_hash FROM chatgpt_sign_ins')).toEqual([{ authorization_code_hash: null }]);
  });

  it('finds no sign-in for a post without the browser cookie', async () => {
    const response = await submitCode('K7M2-QX4P', null);

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('Lượt kết nối này đã hết hạn. Quay lại ChatGPT và kết nối lại.');
    expect(await database.query('SELECT user_id FROM chatgpt_login_codes')).toHaveLength(1);
  });

  it('cannot finish a sign-in older than 10 minutes', async () => {
    clock.advanceBy(11 * ONE_MINUTE_MS);
    await database.query('DELETE FROM chatgpt_login_codes');
    await insertLoginCode(database, { userId: duyUserId, code: 'K7M2-QX4P', expiresAt: new Date(clock.now().getTime() + FIVE_MINUTES_MS) });

    const response = await submitCode('K7M2-QX4P');

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('Lượt kết nối này đã hết hạn.');
  });

  async function openSignIn(): Promise<string> {
    const response = await buildSignInServer().inject({ method: 'GET', url: '/oauth/authorize', query: makeSignInQuery() });
    return String(response.headers['set-cookie']).split(';')[0] ?? '';
  }

  function submitCode(code: string, cookie: string | null = browserCookie) {
    return buildSignInServer().inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie !== null && { cookie }) },
      payload: new URLSearchParams({ code }).toString(),
    });
  }

  function buildSignInServer() {
    return buildServer(pool, null, { chatgptOAuth: { database: pool, clock, publicBaseUrl: PUBLIC_BASE_URL, qrCode: new QrCodeGeneratorRenderer() } });
  }
});
