import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertWorkspaceWithCredits } from './credit-history-rows.ts';
import { postCreditsForm, SESSION_TOKEN } from './internal-admin-requests.ts';
import { insertInternalSession, makeUserInternal } from './internal-user-rows.ts';
import { readCreditBalance } from './llm-call-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const SESSION_TEXT = 'Phiên đăng nhập không hợp lệ. Tải lại trang rồi thử lại.';
const ONE_HOUR_MS = 60 * 60 * 1000;

describe('POST /admin/credits', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let duyUserId: string;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.runtimeUrl);
    clock = new FakeClock(NOW);
    const homeWorkspaceId = await insertWorkspace(database, 'Nhóm của người vận hành');
    duyUserId = await insertMember(database, { workspaceId: homeWorkspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await makeUserInternal(database, duyUserId);
    await insertInternalSession(database, { userId: duyUserId, token: SESSION_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });
    workspaceId = await insertWorkspaceWithCredits(database, 'Xe tải Duy Khương', 150);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('adds the credits of a valid form', async () => {
    const response = await postCreditsForm(pool, clock, { workspace_id: workspaceId, credits: '100', note: 'Nạp thử' });

    expect(response.statusCode).toBe(303);
    expect(response.headers['location']).toBe('/admin');
    expect(await database.query("SELECT added_by, note FROM credit_additions WHERE source = 'internal_user'")).toEqual([{ added_by: duyUserId, note: 'Nạp thử' }]);
    expect(await readCreditBalance(database, workspaceId)).toBe('250.000');
  });

  it('adds once when the same request id is posted twice', async () => {
    const form = { request_id: randomUUID(), workspace_id: workspaceId, credits: '100', note: 'Nạp thử' };

    await postCreditsForm(pool, clock, form);
    const second = await postCreditsForm(pool, clock, form);

    expect(second.statusCode).toBe(303);
    expect(await database.query("SELECT id FROM credit_additions WHERE source = 'internal_user'")).toHaveLength(1);
    expect(await readCreditBalance(database, workspaceId)).toBe('250.000');
  });

  it('refuses a wrong CSRF token', async () => {
    const response = await postCreditsForm(pool, clock, { csrf: 'wrong-token', workspace_id: workspaceId, credits: '100', note: 'Nạp thử' });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain(SESSION_TEXT);
    expect(await database.query("SELECT id FROM credit_additions WHERE source = 'internal_user'")).toEqual([]);
  });
});
