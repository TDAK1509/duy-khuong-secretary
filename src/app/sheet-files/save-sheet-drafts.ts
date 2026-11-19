import type { Transaction } from '../db/transaction.ts';
import { buildMatchKey } from '../documents/build-match-key.ts';
import type { DocumentDraft } from '../documents/document-draft.ts';
import { insertDocument, insertSources } from '../documents/insert-document.ts';
import { insertLines } from '../documents/insert-lines.ts';
import { linkDocumentToMatchingFacts } from '../facts/link-facts.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import type { FileClaim } from './file-claims.ts';

export type SheetDraft = { draft: DocumentDraft; matchesNumber: boolean };

export type SavedCounts = { added: number; updated: number };

const UPDATE_DOCUMENT_SQL = 'UPDATE documents SET title = $3, summary = $4, details = $5 WHERE id = $1 AND workspace_id = $2';

const FIND_SHEET_DOCUMENTS_SQL = `
  SELECT document.id, document.kind FROM documents document
  WHERE document.workspace_id = $1 AND document.vehicle_plate IS NOT DISTINCT FROM $2 AND document.document_date = $3
    AND (NOT $5 OR document.document_number IS NULL OR document.document_number IS NOT DISTINCT FROM $4)
    AND EXISTS (SELECT 1 FROM document_sources source WHERE source.document_id = document.id)
    AND NOT EXISTS (
      SELECT 1 FROM document_sources source
      WHERE source.document_id = document.id
        AND NOT EXISTS (SELECT 1 FROM message_files file WHERE file.message_id = source.message_id))
  ORDER BY document.created_at, document.id`;

export type SheetIdentity = { kindKey: string; plate: string | null; date: string | null; number: string | null; matchesNumber: boolean };

export function readSheetIdentity({ draft, matchesNumber }: SheetDraft): SheetIdentity {
  return { kindKey: buildMatchKey(draft.items[0]?.item.document_kind ?? ''), plate: draft.vehiclePlate, date: draft.documentDate, number: draft.documentNumber, matchesNumber };
}

export function describeSheetIdentity(sheetDraft: SheetDraft): string {
  const { kindKey, plate, date, number, matchesNumber } = readSheetIdentity(sheetDraft);
  return [kindKey, plate ?? '', date ?? '', matchesNumber ? (number ?? '') : '*'].join('|');
}

export async function saveSheetDrafts(transaction: Transaction, claim: FileClaim, drafts: SheetDraft[]): Promise<SavedCounts> {
  const counts = { added: 0, updated: 0 };
  if (drafts.length === 0) return counts;
  await lockWorkspaceRecords(transaction, claim.workspaceId);
  const message = { id: claim.messageId, workspaceId: claim.workspaceId };
  for (const sheetDraft of drafts) {
    const existingId = await findReplaceableDocument(transaction, claim.workspaceId, sheetDraft);
    if (existingId === null) {
      await insertDocument(transaction, message, sheetDraft.draft);
      counts.added += 1;
    } else {
      await replaceDocumentRows(transaction, message, existingId, sheetDraft.draft);
      counts.updated += 1;
    }
  }
  return counts;
}

async function findReplaceableDocument(transaction: Transaction, workspaceId: string, sheetDraft: SheetDraft): Promise<string | null> {
  const { kindKey, plate, date, number, matchesNumber } = readSheetIdentity(sheetDraft);
  const rows = await transaction.query<{ id: string; kind: string }>(FIND_SHEET_DOCUMENTS_SQL, [workspaceId, plate, date, number, matchesNumber]);
  return rows.find((row) => buildMatchKey(row.kind) === kindKey)?.id ?? null;
}

type DocumentMessage = { id: string; workspaceId: string };

async function replaceDocumentRows(transaction: Transaction, message: DocumentMessage, documentId: string, draft: DocumentDraft): Promise<void> {
  const record = draft.items[0]?.record;
  await transaction.query('DELETE FROM document_lines WHERE document_id = $1 AND workspace_id = $2', [documentId, message.workspaceId]);
  await insertLines(transaction, message, documentId, draft);
  await transaction.query(UPDATE_DOCUMENT_SQL, [documentId, message.workspaceId, record?.documentTitle ?? null, record?.summary ?? '', JSON.stringify(record?.details ?? [])]);
  await insertSources(transaction, message, documentId, draft);
  await linkDocumentToMatchingFacts(transaction, message.workspaceId, documentId);
}
