import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as mergeWaitingNames } from '../../src/app/db/migrations/0044_merge_waiting_names.ts';
import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { insertNumberedDocument } from './document-number-rows.ts';
import { insertOrganizationWithAlias } from './document-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the migration that merges the names that are waiting', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let userId: string;
  let chengLoongId: string;
  let documentCount: number;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    chengLoongId = await insertOrganizationWithAlias(database, { workspaceId, name: 'Cheng Loong' });
    documentCount = 0;
  });

  afterEach(async () => {
    await database.drop();
  });

  async function runMigration(): Promise<void> {
    const statements: string[] = [];
    mergeWaitingNames({ sql: (statement) => statements.push(statement), noTransaction: () => {} });
    for (const statement of statements) await database.query(statement);
  }

  async function insertWaitingParty(printedName: string, organizationId: string): Promise<string> {
    documentCount += 1;
    const documentId = await insertNumberedDocument(database, { workspaceId, userId, documentNumber: `${documentCount}` });
    const [party] = await database.query<{ id: string }>(
      `INSERT INTO document_parties (workspace_id, document_id, role, type, printed_name, match_key, proposed_organization_id)
       VALUES (${literal(workspaceId)}, ${literal(documentId)}, 'issuer', 'company', ${literal(printedName)}, ${literal(buildMatchKey(printedName))},
         ${literal(organizationId)})
       RETURNING id`,
    );
    if (!party) throw new Error('party not inserted');
    return party.id;
  }

  it('links a waiting party to its proposed company', async () => {
    await insertWaitingParty('Chống Loong', chengLoongId);

    await runMigration();

    expect(await database.query('SELECT organization_id, proposed_organization_id FROM document_parties')).toEqual([
      { organization_id: chengLoongId, proposed_organization_id: null },
    ]);
  });
});
