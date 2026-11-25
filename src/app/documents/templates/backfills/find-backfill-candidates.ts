import type { Transaction } from '../../../db/transaction.ts';

export const MAX_BACKFILL_PAPERS = 5000;

export type CandidateRule = { templateId: string | null; issuerOrganizationId: string | null; kind: string };

export type BackfillCandidates = { documentIds: string[]; isCapped: boolean };

const FIND_CANDIDATES_SQL = `
  SELECT document.id
  FROM documents document
  WHERE document.workspace_id = $1 AND document.status = 'accepted' AND document.sheet_signature IS NULL
    AND document.admin_corrected_at IS NULL
    AND document.issuer_key IS NOT NULL AND document.document_number IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM document_sources source
      JOIN message_files file ON file.message_id = source.message_id
      WHERE source.document_id = document.id)
    AND EXISTS (
      SELECT 1 FROM document_sources source
      JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
      WHERE source.document_id = document.id AND message.image_key IS NOT NULL AND message.image_deleted_at IS NULL)
    AND (
      document.template_id = $2
      OR CASE WHEN $3::uuid IS NULL THEN document.kind = $4 ELSE EXISTS (
        SELECT 1 FROM document_parties party
        WHERE party.document_id = document.id AND party.role = 'issuer' AND party.organization_id = $3
      ) END)
  ORDER BY document.created_at DESC, document.id DESC
  LIMIT $5`;

export async function findBackfillCandidates(transaction: Transaction, workspaceId: string, rule: CandidateRule): Promise<BackfillCandidates> {
  const rows = await transaction.query<{ id: string }>(FIND_CANDIDATES_SQL, [workspaceId, rule.templateId, rule.issuerOrganizationId, rule.kind, MAX_BACKFILL_PAPERS + 1]);
  return { documentIds: rows.slice(0, MAX_BACKFILL_PAPERS).map((row) => row.id), isCapped: rows.length > MAX_BACKFILL_PAPERS };
}
