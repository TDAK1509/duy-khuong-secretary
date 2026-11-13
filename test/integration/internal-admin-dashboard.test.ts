import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertCall, insertWorkspaceWithCredits } from './credit-history-rows.ts';
import { getAdminPage, SESSION_TOKEN } from './internal-admin-requests.ts';
import { insertInternalSession, makeUserInternal } from './internal-user-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ONE_HOUR_MS = 60 * 60 * 1000;

describe('the admin dashboard', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    const workspaceId = await insertWorkspace(database, 'Nhóm của người vận hành');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await makeUserInternal(database, duyUserId);
    await insertInternalSession(database, { userId: duyUserId, token: SESSION_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('lists each workspace with its balance', async () => {
    await insertWorkspaceWithCredits(database, 'Xe tải Duy Khương', 20000);
    await insertWorkspaceWithCredits(database, 'Xe tải Lan', 150);

    const response = await getAdminPage(pool, clock, '/admin');

    expect(response.body).toMatch(/Xe tải Duy Khương<\/a><\/td>\s*<td>20\.000<\/td>/);
    expect(response.body).toMatch(/Xe tải Lan<\/a><\/td>\s*<td>150<\/td>/);
  });

  it('starts today at midnight Vietnam time', async () => {
    const workspaceId = await insertWorkspaceWithCredits(database, 'Xe tải Duy Khương', 20000);
    await insertCall(database, { workspaceId, createdAt: new Date('2026-11-02T00:30:00+07:00') });
    await insertCall(database, { workspaceId, createdAt: new Date('2026-11-01T23:30:00+07:00') });

    const response = await getAdminPage(pool, clock, '/admin');

    expect(readUsageCells(response.body, 'Xe tải Duy Khương')).toEqual(['40 credit / $0.0264', '79 credit / $0.0528', '79 credit / $0.0528']);
  });

  it('counts a call from 8 days ago in 30 days and not in 7', async () => {
    const workspaceId = await insertWorkspaceWithCredits(database, 'Xe tải Duy Khương', 20000);
    await insertCall(database, { workspaceId, createdAt: new Date('2026-10-25T10:00:00+07:00') });

    const response = await getAdminPage(pool, clock, '/admin');

    expect(readUsageCells(response.body, 'Xe tải Duy Khương')).toEqual(['0 credit / $0.0000', '0 credit / $0.0000', '40 credit / $0.0264']);
  });
});

function readUsageCells(page: string, workspaceName: string): string[] {
  const row = new RegExp(`${workspaceName}</a></td>\\s*<td>[^<]*</td>((?:\\s*<td>[^<]*</td>){3})`).exec(page);
  return [...(row?.[1] ?? '').matchAll(/<td>([^<]*)<\/td>/g)].map((cell) => cell[1] ?? '');
}
