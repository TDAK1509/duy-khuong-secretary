import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertAddition } from './credit-history-rows.ts';
import { getAdminPage, readTableRows, SESSION_TOKEN } from './internal-admin-requests.ts';
import { insertInternalSession, makeUserInternal } from './internal-user-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ONE_HOUR_MS = 60 * 60 * 1000;

describe('the recent additions on the admin page', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let duyUserId: string;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await makeUserInternal(database, duyUserId);
    await insertInternalSession(database, { userId: duyUserId, token: SESSION_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('lists an addition with its time, workspace, credits, adder and note', async () => {
    await insertAddition(database, {
      workspaceId,
      credits: 100,
      balanceAfter: 250,
      source: 'internal_user',
      addedBy: duyUserId,
      note: 'Nạp thử',
      createdAt: new Date('2026-11-02T09:15:00+07:00'),
    });

    const response = await getAdminPage(pool, clock, '/admin');

    expect(response.body).toContain('Các lần nạp gần đây');
    expect(readTableRows(response.body)).toContainEqual(['02/11/2026 09:15', 'Xe tải Duy Khương', '100', 'Duy', 'Nạp thử']);
  });
});
