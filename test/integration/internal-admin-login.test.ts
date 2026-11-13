import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashSecretToken } from '../../src/app/internal-admin/secret-token.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertInternalLoginCode, makeUserInternal, makeUserNotInternal } from './internal-user-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ONE_MINUTE_MS = 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const WRONG_CODE_TEXT = 'Mã không đúng hoặc đã hết hạn. Nhắn "đăng nhập quản trị" cho Trợ lý để lấy mã mới.';

describe('GET /admin without a session', () => {
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

  it('shows the login page with its four steps', async () => {
    const response = await buildServer(pool, null, { internalAdmin: { database: pool, clock: new FakeClock(NOW) } }).inject({ method: 'GET', url: '/admin' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Trang quản trị Trợ lý');
    expect(response.body).toContain('Trang này chỉ dành cho người vận hành Trợ lý.');
    expect(response.body).toContain('1. Mở khung chat với Trợ lý trong Zalo.');
    expect(response.body).toContain('2. Nhắn: đăng nhập quản trị');
    expect(response.body).toContain('3. Trợ lý gửi mã trong một tin nhắn riêng. Sao chép mã rồi dán vào ô dưới đây.');
    expect(response.body).toContain('4. Bấm "Đăng nhập".');
    expect(response.headers['content-security-policy']).toContain("form-action 'self'");
    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('POST /admin/login', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let duyUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await makeUserInternal(database, duyUserId);
    await insertInternalLoginCode(database, { userId: duyUserId, code: 'K7M2-QX4P', expiresAt: new Date(NOW.getTime() + TEN_MINUTES_MS) });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('starts a session for a valid code and uses the code up', async () => {
    const response = await submitCode('K7M2-QX4P');

    expect(response.statusCode).toBe(303);
    expect(response.headers['location']).toBe('/admin');
    const cookie = /^__Host-internal-session=([\w-]+); Path=\/; Max-Age=43200; Secure; HttpOnly; SameSite=Strict$/.exec(String(response.headers['set-cookie']));
    expect(cookie).not.toBeNull();
    expect(await database.query('SELECT token_hash, user_id, expires_at FROM internal_sessions')).toEqual([
      { token_hash: hashSecretToken(cookie?.[1] ?? ''), user_id: duyUserId, expires_at: new Date(NOW.getTime() + TWELVE_HOURS_MS) },
    ]);
    expect(await database.query('SELECT user_id FROM internal_login_codes')).toEqual([]);
  });

  it('refuses a code that already started a session', async () => {
    await submitCode('K7M2-QX4P');

    const response = await submitCode('K7M2-QX4P');

    expect(response.body).toContain(WRONG_CODE_TEXT);
    expect(await database.query('SELECT user_id FROM internal_sessions')).toHaveLength(1);
  });

  it('refuses a code that expired a minute ago', async () => {
    await database.query('DELETE FROM internal_login_codes');
    await insertInternalLoginCode(database, { userId: duyUserId, code: 'K7M2-QX4P', expiresAt: new Date(NOW.getTime() - ONE_MINUTE_MS) });

    const response = await submitCode('K7M2-QX4P');

    expect(response.body).toContain(WRONG_CODE_TEXT);
    expect(await database.query('SELECT user_id FROM internal_sessions')).toEqual([]);
  });

  it('refuses the code of a user who stopped being internal', async () => {
    await makeUserNotInternal(database, duyUserId);

    const response = await submitCode('K7M2-QX4P');

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('Bạn không có quyền vào trang quản trị Trợ lý.');
    expect(await database.query('SELECT user_id FROM internal_sessions')).toEqual([]);
  });

  it('limits the login posts to 20 in 10 minutes', async () => {
    const server = buildServer(pool, null, { internalAdmin: { database: pool, clock } });
    for (let post = 0; post < 20; post += 1) await postCode(server, 'AAAA-AAAA');

    const response = await postCode(server, 'K7M2-QX4P');

    expect(response.statusCode).toBe(429);
    expect(response.body).toContain('Có quá nhiều lần nhập mã. Thử lại sau 10 phút.');
    expect(await database.query('SELECT user_id FROM internal_sessions')).toEqual([]);
  });

  it('blocks the 21st login post of one client address', async () => {
    const server = buildServer(pool, null, { internalAdmin: { database: pool, clock } });
    for (let post = 0; post < 20; post += 1) await postCode(server, 'AAAA-AAAA', { 'cf-connecting-ip': '203.0.113.7' });

    const response = await postCode(server, 'AAAA-AAAA', { 'cf-connecting-ip': '203.0.113.7' });

    expect(response.statusCode).toBe(429);
    expect(response.body).toContain('Có quá nhiều lần nhập mã. Thử lại sau 10 phút.');
  });

  it('lets another client address log in after the first one reached the limit', async () => {
    const server = buildServer(pool, null, { internalAdmin: { database: pool, clock } });
    for (let post = 0; post < 20; post += 1) await postCode(server, 'AAAA-AAAA', { 'cf-connecting-ip': '203.0.113.7' });

    const response = await postCode(server, 'K7M2-QX4P', { 'cf-connecting-ip': '198.51.100.9' });

    expect(response.statusCode).toBe(303);
    expect(await database.query('SELECT user_id FROM internal_sessions')).toEqual([{ user_id: duyUserId }]);
  });

  it('blocks the 21st login post that has no client address header', async () => {
    const server = buildServer(pool, null, { internalAdmin: { database: pool, clock } });
    for (let post = 0; post < 20; post += 1) await postCode(server, 'AAAA-AAAA');

    const response = await postCode(server, 'AAAA-AAAA');

    expect(response.statusCode).toBe(429);
  });

  function submitCode(code: string) {
    return postCode(buildServer(pool, null, { internalAdmin: { database: pool, clock } }), code);
  }

  function postCode(server: ReturnType<typeof buildServer>, code: string, headers: Record<string, string> = {}) {
    return server.inject({
      method: 'POST',
      url: '/admin/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      payload: new URLSearchParams({ code }).toString(),
    });
  }
});
