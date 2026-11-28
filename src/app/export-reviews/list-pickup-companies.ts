import type { Transaction } from '../db/transaction.ts';
import type { SavedRow } from './find-saved-export.ts';

const LIST_PICKUP_ISSUERS_SQL = `
  SELECT document.id, (SELECT party.printed_name FROM document_parties party WHERE party.document_id = document.id AND party.role = 'issuer' ORDER BY party.created_at, party.id LIMIT 1) AS issuer_name
  FROM documents document
  WHERE document.workspace_id = $1 AND document.id = ANY($2::uuid[]) AND document.stage IS DISTINCT FROM 'receipt'`;

export async function listPickupCompanies(transaction: Transaction, workspaceId: string, rows: SavedRow[]): Promise<Map<string, string | null>> {
  const issuers = await transaction.query<{ id: string; issuer_name: string | null }>(LIST_PICKUP_ISSUERS_SQL, [workspaceId, rows.flatMap((row) => row.documentIds)]);
  const issuerOf = new Map(issuers.map((issuer) => [issuer.id, issuer.issuer_name]));
  return new Map(rows.map((row) => [row.id, row.documentIds.map((id) => issuerOf.get(id) ?? null).find((name) => name !== null) ?? null]));
}
