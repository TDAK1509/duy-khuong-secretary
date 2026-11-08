import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertChatMessage } from './message-rows.ts';
import { scopeDatabase } from '../../src/app/db/scoped-database.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const ROW_LEVEL_SECURITY_VIOLATION = '42501';

describe('the document tables for the runtime role', () => {
  let database: TemporaryDatabase;
  let runtimePool: PostgresPool;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    runtimePool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
  });

  afterEach(async () => {
    await runtimePool.end();
    await database.drop();
  });

  it('hides a document of one workspace from another workspace', async () => {
    const userId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertDocumentFromMember(workspaceId, userId);
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');

    const count = await countRows('documents', { workspaceId: otherWorkspaceId });

    expect(count).toBe(0);
  });

  it('hides a document from a member whose message did not produce it', async () => {
    const hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertDocumentFromMember(workspaceId, lanUserId);

    const count = await countRows('documents', { workspaceId, ownerUserId: hungUserId });

    expect(count).toBe(0);
  });

  it('shows a document to the member whose message produced it', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertDocumentFromMember(workspaceId, lanUserId);

    const count = await countRows('documents', { workspaceId, ownerUserId: lanUserId });

    expect(count).toBe(1);
  });

  it('hides the organizations from a member scope', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertOrganization(workspaceId, 'Cheng Loong');

    const count = await countRows('organizations', { workspaceId, ownerUserId: lanUserId });

    expect(count).toBe(0);
  });

  it('refuses an organization written into another workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');

    const insert = runInTransaction(scopeDatabase(runtimePool, { workspaceId }), (transaction) =>
      transaction.query(`INSERT INTO organizations (workspace_id, type, name) VALUES ($1, 'company', 'Cheng Loong')`, [
        otherWorkspaceId,
      ]),
    );

    await expect(insert).rejects.toMatchObject({
      code: ROW_LEVEL_SECURITY_VIOLATION,
      message: expect.stringContaining('"organizations"'),
    });
  });

  async function insertDocumentFromMember(inWorkspaceId: string, userId: string): Promise<string> {
    const documentId = await insertDocument(inWorkspaceId);
    const messageId = await insertChatMessage(database, {
      workspaceId: inWorkspaceId,
      userId,
      author: 'user',
      text: null,
      imageKey: 'a.jpg',
      createdAt: new Date('2026-11-05T10:00:00+07:00'),
    });
    await database.query(
      `INSERT INTO document_sources (workspace_id, document_id, message_id, item_index)
       VALUES (${literal(inWorkspaceId)}, ${literal(documentId)}, ${literal(messageId)}, 0)`,
    );
    return documentId;
  }

  async function insertDocument(inWorkspaceId: string): Promise<string> {
    const [row] = await database.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, kind, summary)
       VALUES (${literal(inWorkspaceId)}, 'phiếu cân', 'Phiếu cân xe') RETURNING id`,
    );
    if (!row) throw new Error('document not inserted');
    return row.id;
  }

  async function insertOrganization(inWorkspaceId: string, name: string): Promise<string> {
    const [row] = await database.query<{ id: string }>(
      `INSERT INTO organizations (workspace_id, type, name)
       VALUES (${literal(inWorkspaceId)}, 'company', ${literal(name)}) RETURNING id`,
    );
    if (!row) throw new Error('organization not inserted');
    return row.id;
  }

  async function countRows(table: string, scope: { workspaceId: string; ownerUserId?: string }): Promise<number> {
    const rows = await runInTransaction(scopeDatabase(runtimePool, scope), (transaction) =>
      transaction.query<{ count: string }>(`SELECT count(*) FROM ${table}`),
    );
    return Number(rows[0]?.count);
  }
});
