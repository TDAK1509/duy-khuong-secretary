import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertNumberedDocument } from './document-number-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the migration that drops the proposed company column', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('leaves a party without the proposed company column', async () => {
    const columns = await database.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'document_parties'`,
    );

    expect(columns.map((column) => column.column_name)).not.toContain('proposed_organization_id');
  });

  it('refuses a party without a company', async () => {
    const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const userId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    const documentId = await insertNumberedDocument(database, { workspaceId, userId, documentNumber: '1' });

    await expect(
      database.query(
        `INSERT INTO document_parties (workspace_id, document_id, role, type, printed_name, match_key)
         VALUES (${literal(workspaceId)}, ${literal(documentId)}, 'issuer', 'company', 'Cheng Loong', 'chengloong')`,
      ),
    ).rejects.toMatchObject({ code: '23502' });
  });
});
