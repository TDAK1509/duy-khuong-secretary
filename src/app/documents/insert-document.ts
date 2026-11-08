import type { Transaction } from '../db/transaction.ts';
import type { DocumentDraft } from './document-draft.ts';
import { insertLines } from './insert-lines.ts';
import { insertRow } from './insert-row.ts';
import type { DocumentMessage } from './store-documents.ts';

const FALLBACK_KIND = 'khác';

export type DocumentStatus = 'accepted' | 'needs_review';

export async function insertDocument(
  transaction: Transaction,
  message: DocumentMessage,
  draft: DocumentDraft,
  status: DocumentStatus,
): Promise<string> {
  const documentId = await insertRow(transaction, 'documents', buildDocumentRow(message, draft, status));
  await insertLines(transaction, message, documentId, draft);
  await insertSources(transaction, message, documentId, draft);
  return documentId;
}

function buildDocumentRow({ workspaceId }: DocumentMessage, draft: DocumentDraft, status: DocumentStatus): Record<string, unknown> {
  const { item, record } = draft.items[0] ?? failEmptyDraft();
  return {
    workspace_id: workspaceId,
    kind: item.document_kind.trim() === '' ? FALLBACK_KIND : item.document_kind,
    stage: item.stage,
    status,
    document_number: draft.documentNumber,
    issuer_key: draft.issuerKey,
    document_date: draft.documentDate,
    title: record.documentTitle,
    vehicle_plate: draft.vehiclePlate,
    summary: record.summary,
    details: JSON.stringify(record.details),
  };
}

function failEmptyDraft(): never {
  throw new Error('A document draft holds no item');
}

export async function insertSources(transaction: Transaction, message: DocumentMessage, documentId: string, draft: DocumentDraft): Promise<void> {
  for (const { record } of draft.items) {
    const source = { workspace_id: message.workspaceId, document_id: documentId, message_id: message.id, item_index: record.itemIndex };
    await insertRow(transaction, 'document_sources', source);
  }
}
