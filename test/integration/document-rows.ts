import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { insertChatMessage } from './message-rows.ts';
import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type NewDocumentRow = {
  workspaceId: string;
  userId: string;
  issuerKey: string;
  documentNumber: string;
  documentDate: string;
  vehiclePlate: string | null;
  status?: 'accepted' | 'needs_review';
  kind?: string;
};

export async function insertDocumentWithSource(database: TemporaryDatabase, row: NewDocumentRow): Promise<string> {
  const [document] = await database.query<{ id: string }>(
    `INSERT INTO documents (workspace_id, kind, status, document_number, issuer_key, document_date, vehicle_plate, summary)
     VALUES (${literal(row.workspaceId)}, ${literal(row.kind ?? 'phiếu cân xe')}, ${literal(row.status ?? 'accepted')}, ${literal(row.documentNumber)},
       ${literal(row.issuerKey)}, ${literal(row.documentDate)}, ${row.vehiclePlate === null ? 'NULL' : literal(row.vehiclePlate)}, 'Phiếu cân')
     RETURNING id`,
  );
  if (!document) throw new Error('document not inserted');
  await insertSourceMessage(database, row, document.id);
  return document.id;
}

async function insertSourceMessage(database: TemporaryDatabase, row: NewDocumentRow, documentId: string): Promise<void> {
  const messageId = await insertChatMessage(database, {
    workspaceId: row.workspaceId,
    userId: row.userId,
    author: 'user',
    text: null,
    imageKey: 'earlier.jpg',
    createdAt: new Date('2026-11-05T10:00:00+07:00'),
  });
  await database.query(
    `INSERT INTO document_sources (workspace_id, document_id, message_id, item_index)
     VALUES (${literal(row.workspaceId)}, ${literal(documentId)}, ${literal(messageId)}, 0)`,
  );
}

export type NewOrganizationRow = { workspaceId: string; name: string; type?: 'company' | 'place'; aliasPrintedName?: string };

export async function insertOrganizationWithAlias(database: TemporaryDatabase, row: NewOrganizationRow): Promise<string> {
  const [organization] = await database.query<{ id: string }>(
    `INSERT INTO organizations (workspace_id, type, name) VALUES (${literal(row.workspaceId)}, ${literal(row.type ?? 'company')}, ${literal(row.name)})
     RETURNING id`,
  );
  if (!organization) throw new Error('organization not inserted');
  const aliasPrintedName = row.aliasPrintedName ?? row.name;
  await database.query(
    `INSERT INTO organization_aliases (workspace_id, organization_id, printed_name, match_key)
     VALUES (${literal(row.workspaceId)}, ${literal(organization.id)}, ${literal(aliasPrintedName)}, ${literal(buildMatchKey(aliasPrintedName))})`,
  );
  return organization.id;
}

export async function insertMeaning(database: TemporaryDatabase, workspaceId: string, name: string): Promise<void> {
  await database.query(
    `INSERT INTO meanings (workspace_id, value_type, name, match_key)
     VALUES (${literal(workspaceId)}, 'number', ${literal(name)}, ${literal(buildMatchKey(name))})`,
  );
}
