import type { Transaction } from '../db/transaction.ts';
import type { ReadingDetail } from '../reading/reading.ts';
import type { DocumentDraft } from './document-draft.ts';
import { findOrInsertMeaning } from './find-or-insert-meaning.ts';
import { insertRow } from './insert-row.ts';
import { parseDateTime } from './parse-date-time.ts';
import type { DocumentMessage } from './store-documents.ts';

export async function insertLines(transaction: Transaction, message: DocumentMessage, documentId: string, draft: DocumentDraft): Promise<void> {
  for (const [lineNo, detail] of listLineDetails(draft).entries()) {
    const meaningId = await findOrInsertMeaning(transaction, message.workspaceId, detail);
    await insertRow(transaction, 'document_lines', buildLineRow(message, documentId, lineNo, detail, meaningId));
  }
}

export function listLineDetails(draft: DocumentDraft): ReadingDetail[] {
  return draft.lineItems.flatMap(({ item }) => item.details).filter((detail) => detail.label.trim() !== '');
}

export function buildLineRow(
  { workspaceId }: DocumentMessage,
  documentId: string,
  lineNo: number,
  detail: ReadingDetail,
  meaningId: string | null,
): Record<string, unknown> {
  return {
    workspace_id: workspaceId,
    document_id: documentId,
    line_no: lineNo,
    label: detail.label.trim(),
    value: detail.value,
    item: detail.item?.trim() || null,
    number: meaningId && detail.line_number,
    unit: meaningId && detail.line_unit,
    at: meaningId && parseDateTime(detail.date_time),
    meaning_id: meaningId,
  };
}
