import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { insertDocumentWithSource } from './document-rows.ts';
import { insertChatMessage } from './message-rows.ts';
import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type NewNumberedDocument = {
  workspaceId: string;
  userId: string;
  documentNumber: string;
  documentDate?: string;
  status?: 'accepted' | 'needs_review';
  stage?: 'dispatch' | 'receipt' | null;
  kind?: string;
  vehiclePlate?: string | null;
};

export async function insertNumberedDocument(database: TemporaryDatabase, row: NewNumberedDocument): Promise<string> {
  const documentId = await insertDocumentWithSource(database, {
    workspaceId: row.workspaceId,
    userId: row.userId,
    issuerKey: `issuer${row.documentNumber}`,
    documentNumber: row.documentNumber,
    documentDate: row.documentDate ?? '2026-11-05',
    vehiclePlate: row.vehiclePlate ?? null,
    status: row.status,
    kind: row.kind,
  });
  if (row.stage) await database.query(`UPDATE documents SET stage = ${literal(row.stage)} WHERE id = ${literal(documentId)}`);
  return documentId;
}

export async function insertAnotherSource(database: TemporaryDatabase, row: { workspaceId: string; userId: string; documentId: string }): Promise<void> {
  const messageId = await insertChatMessage(database, {
    workspaceId: row.workspaceId,
    userId: row.userId,
    author: 'user',
    text: null,
    imageKey: 'second-copy.jpg',
    createdAt: new Date('2026-11-05T10:05:00+07:00'),
  });
  await database.query(
    `INSERT INTO document_sources (workspace_id, document_id, message_id, item_index)
     VALUES (${literal(row.workspaceId)}, ${literal(row.documentId)}, ${literal(messageId)}, 0)`,
  );
}

export type NewDocumentLine = {
  workspaceId: string;
  documentId: string;
  lineNo: number;
  meaning: string;
  item?: string | null;
};

export type NewNumberLine = NewDocumentLine & { number: number; unit: string };

export async function insertNumberLine(database: TemporaryDatabase, line: NewNumberLine): Promise<void> {
  const meaningId = await insertLineMeaning(database, line, 'number');
  await database.query(
    `INSERT INTO document_lines (workspace_id, document_id, line_no, label, value, item, number, unit, meaning_id)
     VALUES (${literal(line.workspaceId)}, ${literal(line.documentId)}, ${line.lineNo}, ${literal(line.meaning)}, ${literal(`${line.number} ${line.unit}`)},
       ${line.item ? literal(line.item) : 'NULL'}, ${line.number}, ${literal(line.unit)}, ${literal(meaningId)})`,
  );
}

export type NewDateLine = NewDocumentLine & { at: string };

export async function insertDateLine(database: TemporaryDatabase, line: NewDateLine): Promise<void> {
  const meaningId = await insertLineMeaning(database, line, 'date');
  await database.query(
    `INSERT INTO document_lines (workspace_id, document_id, line_no, label, value, item, at, meaning_id)
     VALUES (${literal(line.workspaceId)}, ${literal(line.documentId)}, ${line.lineNo}, ${literal(line.meaning)}, ${literal(line.at)},
       ${line.item ? literal(line.item) : 'NULL'}, ${literal(line.at)}, ${literal(meaningId)})`,
  );
}

async function insertLineMeaning(database: TemporaryDatabase, line: NewDocumentLine, valueType: 'number' | 'date'): Promise<string> {
  const [meaning] = await database.query<{ id: string }>(
    `INSERT INTO meanings (workspace_id, value_type, name, match_key)
     VALUES (${literal(line.workspaceId)}, ${literal(valueType)}, ${literal(line.meaning)}, ${literal(buildMatchKey(line.meaning))})
     ON CONFLICT (workspace_id, value_type, match_key) DO UPDATE SET name = meanings.name
     RETURNING id`,
  );
  if (!meaning) throw new Error('meaning not inserted');
  return meaning.id;
}

export type NewParty = {
  workspaceId: string;
  documentId: string;
  role: 'issuer' | 'supplier' | 'customer' | 'carrier' | 'place';
  organizationId: string;
  printedName: string;
};

export async function insertParty(database: TemporaryDatabase, party: NewParty): Promise<void> {
  await database.query(
    `INSERT INTO document_parties (workspace_id, document_id, role, type, printed_name, match_key, organization_id)
     VALUES (${literal(party.workspaceId)}, ${literal(party.documentId)}, ${literal(party.role)}, 'company', ${literal(party.printedName)},
       ${literal(buildMatchKey(party.printedName))}, ${literal(party.organizationId)})`,
  );
}

export async function insertAlias(database: TemporaryDatabase, row: { workspaceId: string; organizationId: string; printedName: string }): Promise<void> {
  await database.query(
    `INSERT INTO organization_aliases (workspace_id, organization_id, printed_name, match_key)
     VALUES (${literal(row.workspaceId)}, ${literal(row.organizationId)}, ${literal(row.printedName)}, ${literal(buildMatchKey(row.printedName))})`,
  );
}

export async function insertSourceOfMessage(database: TemporaryDatabase, row: { workspaceId: string; documentId: string; messageId: string }): Promise<void> {
  await database.query(
    `INSERT INTO document_sources (workspace_id, document_id, message_id, item_index)
     VALUES (${literal(row.workspaceId)}, ${literal(row.documentId)}, ${literal(row.messageId)}, 1)`,
  );
}

export async function insertReadOfMessage(database: TemporaryDatabase, row: { workspaceId: string; messageId: string }): Promise<void> {
  await database.query(
    `INSERT INTO document_reads (workspace_id, message_id, outcome) VALUES (${literal(row.workspaceId)}, ${literal(row.messageId)}, 'no_document')`,
  );
}
