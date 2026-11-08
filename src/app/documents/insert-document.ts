import type { Transaction } from '../db/transaction.ts';
import type { DocumentDraft } from './document-draft.ts';
import type { DocumentMessage } from './store-documents.ts';

const FALLBACK_KIND = 'khác';

export async function insertDocument(transaction: Transaction, message: DocumentMessage, draft: DocumentDraft): Promise<string> {
  const [first] = draft.items;
  if (!first) throw new Error('A document draft holds no item');
  const { item, record } = first;
  const [row] = await transaction.query<{ id: string }>(
    `INSERT INTO documents
       (workspace_id, kind, stage, document_number, issuer_key, document_date, title, vehicle_plate, summary, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING id`,
    [
      message.workspaceId,
      item.document_kind.trim() === '' ? FALLBACK_KIND : item.document_kind,
      item.stage,
      draft.documentNumber,
      draft.issuerKey,
      draft.documentDate,
      record.documentTitle,
      draft.vehiclePlate,
      record.summary,
      JSON.stringify(record.details),
    ],
  );
  if (!row) throw new Error('The document was not inserted');
  await insertSources(transaction, message, row.id, draft);
  return row.id;
}

async function insertSources(transaction: Transaction, message: DocumentMessage, documentId: string, draft: DocumentDraft): Promise<void> {
  for (const { record } of draft.items) {
    await transaction.query(
      `INSERT INTO document_sources (workspace_id, document_id, message_id, item_index) VALUES ($1, $2, $3, $4)`,
      [message.workspaceId, documentId, message.id, record.itemIndex],
    );
  }
}
