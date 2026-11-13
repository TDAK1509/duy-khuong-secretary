import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { getAdminPage, SESSION_TOKEN } from './internal-admin-requests.ts';
import { insertInternalSession, makeUserInternal, makeUserNotInternal } from './internal-user-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

describe('GET /admin with a session cookie', () => {
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
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('shows the dashboard for a live session', async () => {
    await insertInternalSession(database, { userId: duyUserId, token: SESSION_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });

    const response = await getAdminPage(pool, clock, '/admin');

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Số dư và mức dùng');
    expect(response.body).not.toContain('Đăng nhập');
  });

  it('shows the login page for a session that expired a minute ago', async () => {
    await insertInternalSession(database, { userId: duyUserId, token: SESSION_TOKEN, expiresAt: new Date(NOW.getTime() - ONE_MINUTE_MS) });

    const response = await getAdminPage(pool, clock, '/admin');

    expect(response.body).toContain('Mã đăng nhập');
    expect(response.body).not.toContain('Số dư và mức dùng');
  });
});
