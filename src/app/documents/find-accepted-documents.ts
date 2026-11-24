import type { Transaction } from '../db/transaction.ts';
import { describePaperLines } from './describe-paper-lines.ts';
import type { DocumentDraft } from './document-draft.ts';

export type AcceptedDocument = { id: string; vehicle_plate: string | null };

const FIND_NUMBERED_SQL = `
  SELECT id, vehicle_plate FROM documents
  WHERE workspace_id = $1 AND status = 'accepted' AND issuer_key = $2 AND document_number = $3
    AND document_date IS NOT DISTINCT FROM $4::date
  ORDER BY created_at, id`;

const FIND_UNNUMBERED_SQL = `
  SELECT id, vehicle_plate FROM documents document
  WHERE workspace_id = $1 AND status = 'accepted' AND sheet_signature IS NULL AND document_number IS NULL
    AND issuer_key = $2 AND document_date = $3::date AND vehicle_plate = $4
    AND ARRAY(
      SELECT DISTINCT line.number FROM document_lines line
      WHERE line.document_id = document.id AND line.unit = 'kg' AND line.item IS NULL AND line.number IS NOT NULL
      ORDER BY line.number
    ) = $5::numeric[]
    AND ARRAY(
      SELECT DISTINCT line.at FROM document_lines line
      WHERE line.document_id = document.id AND line.at::time <> TIME '00:00:00'
      ORDER BY line.at
    ) = $6::timestamp[]
  ORDER BY created_at, id`;

export async function findAcceptedDocuments(transaction: Transaction, workspaceId: string, draft: DocumentDraft): Promise<AcceptedDocument[]> {
  if (draft.issuerKey === null) return [];
  if (draft.documentNumber === null) return findUnnumberedDocuments(transaction, workspaceId, draft);
  const values = [workspaceId, draft.issuerKey, draft.documentNumber, draft.documentDate];
  return transaction.query<AcceptedDocument>(FIND_NUMBERED_SQL, values);
}

async function findUnnumberedDocuments(transaction: Transaction, workspaceId: string, draft: DocumentDraft): Promise<AcceptedDocument[]> {
  const { kilograms, printedTimes } = describePaperLines(draft);
  const { documentDate, vehiclePlate } = draft;
  if (documentDate === null || vehiclePlate === null || kilograms.length === 0 || printedTimes.length === 0) return [];
  const values = [workspaceId, draft.issuerKey, documentDate, vehiclePlate, kilograms, printedTimes];
  return transaction.query<AcceptedDocument>(FIND_UNNUMBERED_SQL, values);
}
