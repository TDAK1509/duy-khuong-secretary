import { randomUUID } from 'node:crypto';
import type { Transaction } from '../db/transaction.ts';
import type { DocumentDraft } from '../documents/document-draft.ts';
import { buildDocumentRow } from '../documents/insert-document.ts';
import { buildLineRow, listLineDetails } from '../documents/insert-lines.ts';
import { insertRows } from '../documents/insert-row.ts';
import { describeMeaning, findOrInsertMeanings } from '../documents/find-or-insert-meaning.ts';
import type { DocumentMessage } from '../documents/store-documents.ts';
import { linkDocumentsToMatchingFacts } from '../facts/link-facts.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import type { FileClaim } from './file-claims.ts';

export type SheetBatch = { signature: string; matchesNumber: boolean; drafts: DocumentDraft[] };

export type SavedCounts = { added: number; updated: number };

type SheetDocument = { id: string; vehicle_plate: string | null; document_date: string; document_number: string | null };

type PlacedDraft = { documentId: string; draft: DocumentDraft; isNew: boolean };

const FIND_SHEET_DOCUMENTS_SQL = `
  SELECT document.id, document.vehicle_plate, document.document_date::text AS document_date, document.document_number
  FROM documents document
  WHERE document.workspace_id = $1 AND document.sheet_signature = $2 AND document.document_date = ANY($3::date[])
    AND NOT EXISTS (
      SELECT 1 FROM document_sources source
      WHERE source.document_id = document.id
        AND NOT EXISTS (SELECT 1 FROM message_files file WHERE file.message_id = source.message_id))
  ORDER BY document.created_at, document.id`;

const UPDATE_DOCUMENTS_SQL = `
  UPDATE documents document SET title = draft.title, summary = draft.summary, details = draft.details
  FROM jsonb_to_recordset($2::jsonb) AS draft(id uuid, title text, summary text, details jsonb)
  WHERE document.id = draft.id AND document.workspace_id = $1`;

export function describeSheetIdentity(draft: DocumentDraft, matchesNumber: boolean): string {
  return [draft.vehiclePlate ?? '', draft.documentDate ?? '', matchesNumber ? (draft.documentNumber ?? '') : '*'].join('|');
}

export async function saveSheetDrafts(transaction: Transaction, claim: FileClaim, batch: SheetBatch): Promise<SavedCounts> {
  if (batch.drafts.length === 0) return { added: 0, updated: 0 };
  const message = { id: claim.messageId, workspaceId: claim.workspaceId };
  await lockWorkspaceRecords(transaction, claim.workspaceId);
  const placed = placeDrafts(batch, await findSheetDocuments(transaction, claim.workspaceId, batch));
  await insertNewDocuments(transaction, message, batch.signature, placed.filter((entry) => entry.isNew));
  await updateExistingDocuments(transaction, message, placed.filter((entry) => !entry.isNew));
  await insertSheetLines(transaction, message, placed);
  await insertRows(transaction, 'document_sources', placed.flatMap((entry) => buildSourceRows(message, entry)));
  await linkDocumentsToMatchingFacts(transaction, claim.workspaceId, placed.map((entry) => entry.documentId));
  const added = placed.filter((entry) => entry.isNew).length;
  return { added, updated: placed.length - added };
}

async function findSheetDocuments(transaction: Transaction, workspaceId: string, batch: SheetBatch): Promise<SheetDocument[]> {
  const dates = [...new Set(batch.drafts.map((draft) => draft.documentDate).filter((date) => date !== null))];
  return transaction.query<SheetDocument>(FIND_SHEET_DOCUMENTS_SQL, [workspaceId, batch.signature, dates]);
}

function placeDrafts({ drafts, matchesNumber }: SheetBatch, documents: SheetDocument[]): PlacedDraft[] {
  const claimedIds = new Set<string>();
  return drafts.map((draft) => {
    const existing = documents.find((document) => !claimedIds.has(document.id) && isSameRow(document, draft, matchesNumber));
    if (!existing) return { documentId: randomUUID(), draft, isNew: true };
    claimedIds.add(existing.id);
    return { documentId: existing.id, draft, isNew: false };
  });
}

function isSameRow(document: SheetDocument, draft: DocumentDraft, matchesNumber: boolean): boolean {
  const numberMatches = !matchesNumber || document.document_number === null || document.document_number === draft.documentNumber;
  return document.vehicle_plate === draft.vehiclePlate && document.document_date === draft.documentDate && numberMatches;
}

async function insertNewDocuments(transaction: Transaction, message: DocumentMessage, signature: string, entries: PlacedDraft[]): Promise<void> {
  const rows = entries.map(({ documentId, draft }) => ({
    ...buildDocumentRow(message, draft), id: documentId, sheet_signature: signature, details: draft.items[0]?.record.details ?? [],
  }));
  await insertRows(transaction, 'documents', rows);
}

async function updateExistingDocuments(transaction: Transaction, message: DocumentMessage, entries: PlacedDraft[]): Promise<void> {
  if (entries.length === 0) return;
  const documentIds = entries.map((entry) => entry.documentId);
  const updates = entries.map(({ documentId, draft }) => {
    const record = draft.items[0]?.record;
    return { id: documentId, title: record?.documentTitle ?? null, summary: record?.summary ?? '', details: record?.details ?? [] };
  });
  await transaction.query('DELETE FROM document_lines WHERE workspace_id = $1 AND document_id = ANY($2::uuid[])', [message.workspaceId, documentIds]);
  await transaction.query(UPDATE_DOCUMENTS_SQL, [message.workspaceId, JSON.stringify(updates)]);
}

async function insertSheetLines(transaction: Transaction, message: DocumentMessage, entries: PlacedDraft[]): Promise<void> {
  const linesByDocument = entries.map(({ documentId, draft }) => ({ documentId, details: listLineDetails(draft) }));
  const meaningIds = await findOrInsertMeanings(transaction, message.workspaceId, linesByDocument.flatMap((entry) => entry.details));
  const rows = linesByDocument.flatMap(({ documentId, details }) =>
    details.map((detail, lineNo) => buildLineRow(message.workspaceId, documentId, lineNo, detail, meaningIds.get(describeMeaning(detail)) ?? null)),
  );
  await insertRows(transaction, 'document_lines', rows);
}

function buildSourceRows(message: DocumentMessage, { documentId, draft }: PlacedDraft): Record<string, unknown>[] {
  return draft.items.map(({ record }) => ({ workspace_id: message.workspaceId, document_id: documentId, message_id: message.id, item_index: record.itemIndex }));
}
