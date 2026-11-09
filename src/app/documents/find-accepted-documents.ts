import type { Transaction } from '../db/transaction.ts';
import type { DocumentDraft } from './document-draft.ts';

export type AcceptedDocument = { id: string; vehicle_plate: string | null };

export async function findAcceptedDocuments(
  transaction: Transaction,
  workspaceId: string,
  { issuerKey, documentNumber, documentDate }: DocumentDraft,
): Promise<AcceptedDocument[]> {
  if (issuerKey === null || documentNumber === null) return [];
  return transaction.query<AcceptedDocument>(
    `SELECT id, vehicle_plate FROM documents
     WHERE workspace_id = $1 AND status = 'accepted' AND issuer_key = $2 AND document_number = $3
       AND document_date IS NOT DISTINCT FROM $4::date
     ORDER BY created_at, id`,
    [workspaceId, issuerKey, documentNumber, documentDate],
  );
}
