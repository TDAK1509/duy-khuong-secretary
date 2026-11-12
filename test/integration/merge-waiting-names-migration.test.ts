import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as mergeWaitingNames } from '../../src/app/db/migrations/0044_merge_waiting_names.ts';
import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { insertAlias, insertNumberedDocument } from './document-number-rows.ts';
import { insertOrganizationWithAlias } from './document-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { RESTORE_THE_PROPOSED_ORGANIZATION_SHAPE } from './proposed-organization-shape.ts';
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
    await database.query(RESTORE_THE_PROPOSED_ORGANIZATION_SHAPE);
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

  it('gives one waiting spelling on two papers one alias and one merge row', async () => {
    await insertWaitingParty('Chống Loong', chengLoongId);
    await insertWaitingParty('Chống Loong', chengLoongId);

    await runMigration();

    expect(await database.query(`SELECT printed_name, organization_id FROM organization_aliases WHERE match_key = 'chongloong'`)).toEqual([
      { printed_name: 'Chống Loong', organization_id: chengLoongId },
    ]);
    expect(await database.query('SELECT printed_name, match_key, organization_id FROM merged_names')).toEqual([
      { printed_name: 'Chống Loong', match_key: 'chongloong', organization_id: chengLoongId },
    ]);
    expect(await database.query('SELECT organization_id FROM document_parties')).toEqual([
      { organization_id: chengLoongId },
      { organization_id: chengLoongId },
    ]);
  });

  it('lets the earliest waiting party pick the company', async () => {
    const otherCompanyId = await insertOrganizationWithAlias(database, { workspaceId, name: 'Cheng Long Khác' });
    await insertWaitingParty('Chống Loong', chengLoongId);
    await insertWaitingParty('Chống Loong', otherCompanyId);

    await runMigration();

    expect(await database.query('SELECT DISTINCT organization_id FROM document_parties')).toEqual([{ organization_id: chengLoongId }]);
    expect(await database.query('SELECT organization_id FROM merged_names')).toEqual([{ organization_id: chengLoongId }]);
  });

  it('lets an existing alias win and adds no merge row', async () => {
    const aliasCompanyId = await insertOrganizationWithAlias(database, { workspaceId, name: 'Chống Loong Thật' });
    await insertAlias(database, { workspaceId, organizationId: aliasCompanyId, printedName: 'Chống Loong' });
    await insertWaitingParty('Chống Loong', chengLoongId);

    await runMigration();

    expect(await database.query('SELECT organization_id, proposed_organization_id FROM document_parties')).toEqual([
      { organization_id: aliasCompanyId, proposed_organization_id: null },
    ]);
    expect(await database.query('SELECT id FROM merged_names')).toEqual([]);
  });
});
