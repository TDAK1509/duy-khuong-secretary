import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertAddition, insertCall } from './credit-history-rows.ts';
import { getAdminPage, readTableRows, SESSION_TOKEN } from './internal-admin-requests.ts';
import { insertInternalSession, makeUserInternal } from './internal-user-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ONE_HOUR_MS = 60 * 60 * 1000;

describe('the workspace credit history page', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await makeUserInternal(database, duyUserId);
    await insertInternalSession(database, { userId: duyUserId, token: SESSION_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('shows an addition with its balance after', async () => {
    await insertAddition(database, { workspaceId, credits: 20000, balanceAfter: 20000, createdAt: new Date('2026-10-30T09:15:00+07:00') });

    const response = await getAdminPage(pool, clock, `/admin/workspaces/${workspaceId}`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Lịch sử credit: Xe tải Duy Khương');
    expect(readTableRows(response.body)).toEqual([
      ['30/10/2026 09:15', 'Nạp: tặng khi bắt đầu', '', '+20.000', '', 'Tặng khi bắt đầu', 'Credit ban đầu', '20.000'],
    ]);
  });

  it('groups the usage per day and kind', async () => {
    await insertCall(database, { workspaceId, createdAt: new Date('2026-11-02T08:00:00+07:00'), balanceAfter: 19960.4 });
    await insertCall(database, { workspaceId, createdAt: new Date('2026-11-02T08:30:00+07:00'), balanceAfter: 19920.8 });
    await insertCall(database, { workspaceId, createdAt: new Date('2026-11-02T09:00:00+07:00'), balanceAfter: 19881.2 });

    const response = await getAdminPage(pool, clock, `/admin/workspaces/${workspaceId}`);

    expect(readTableRows(response.body)).toEqual([['02/11/2026', 'Đọc ảnh', '3', '−118,8', '$0.0792', '', '', '19.881,2']]);
  });

  it('lists the entries newest first', async () => {
    await insertAddition(database, { workspaceId, credits: 20000, balanceAfter: 20000, createdAt: new Date('2026-11-01T09:00:00+07:00') });
    await insertCall(database, { workspaceId, createdAt: new Date('2026-11-02T08:00:00+07:00'), balanceAfter: 19960.4 });

    const response = await getAdminPage(pool, clock, `/admin/workspaces/${workspaceId}`);

    expect(readTableRows(response.body).map((cells) => cells[1])).toEqual(['Đọc ảnh', 'Nạp: tặng khi bắt đầu']);
  });
});
