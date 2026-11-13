import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scopeDatabase } from '../../src/app/db/scoped-database.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { insertMemberFact, type NewMemberFact } from './member-fact-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const ROW_LEVEL_SECURITY_VIOLATION = '42501';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const PLATE_FACT = 'Lái xe biển số 93A-1234';

describe('the facts about a member for the runtime role', () => {
  let database: TemporaryDatabase;
  let runtimePool: PostgresPool;
  let workspaceId: string;
  let duyUserId: string;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    runtimePool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
  });

  afterEach(async () => {
    await runtimePool.end();
    await database.drop();
  });

  function newFact(overrides: Partial<NewMemberFact> = {}): NewMemberFact {
    return { workspaceId, memberUserId: hungUserId, authorUserId: duyUserId, readers: 'admins_and_member', fact: PLATE_FACT, ...overrides };
  }

  it('shows the workspace scope the facts about a member', async () => {
    await insertMemberFact(database, newFact());

    const rows = await selectFacts({ workspaceId });

    expect(rows).toEqual([{ member_user_id: hungUserId, fact: PLATE_FACT }]);
  });

  it('shows the member scope no facts', async () => {
    await insertMemberFact(database, newFact());

    const rows = await selectFacts({ workspaceId, ownerUserId: hungUserId });

    expect(rows).toEqual([]);
  });

  it('refuses to write facts in a member scope', async () => {
    const insert = runInTransaction(scopeDatabase(runtimePool, { workspaceId, ownerUserId: hungUserId }), (transaction) =>
      transaction.query(
        `INSERT INTO member_facts (workspace_id, member_user_id, author_user_id, readers, fact) VALUES ($1, $2, $3, 'admins', 'A')`,
        [workspaceId, hungUserId, duyUserId],
      ),
    );

    await expect(insert).rejects.toMatchObject({ code: ROW_LEVEL_SECURITY_VIOLATION });
  });

  it('shows the workspace scope of another workspace no facts', async () => {
    await insertMemberFact(database, newFact());
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');

    const rows = await selectFacts({ workspaceId: otherWorkspaceId });

    expect(rows).toEqual([]);
  });

  it('deletes the facts about a member when the membership is removed', async () => {
    await insertMemberFact(database, newFact());

    await database.query(`DELETE FROM memberships WHERE user_id = '${hungUserId}'`);

    expect(await database.query('SELECT member_user_id FROM member_facts')).toEqual([]);
  });

  it('refuses facts about a user who is not a member', async () => {
    const [stranger] = await database.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');

    const insert = insertMemberFact(database, newFact({ memberUserId: stranger?.id ?? '' }));

    await expect(insert).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('refuses a blank fact', async () => {
    const insert = insertMemberFact(database, newFact({ fact: '  ' }));

    await expect(insert).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses readers that are not one of the three', async () => {
    const insert = insertMemberFact(database, newFact({ readers: 'everyone' as NewMemberFact['readers'] }));

    await expect(insert).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses an author-only fact with no author', async () => {
    const insert = insertMemberFact(database, newFact({ authorUserId: null, readers: 'author' }));

    await expect(insert).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('accepts a shared fact with no author', async () => {
    await insertMemberFact(database, newFact({ authorUserId: null }));

    expect(await database.query('SELECT author_user_id FROM member_facts')).toEqual([{ author_user_id: null }]);
  });

  async function selectFacts(scope: { workspaceId: string; ownerUserId?: string }): Promise<object[]> {
    return runInTransaction(scopeDatabase(runtimePool, scope), (transaction) =>
      transaction.query('SELECT member_user_id, fact FROM member_facts'),
    );
  }
});
