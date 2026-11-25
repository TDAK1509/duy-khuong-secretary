import type { NewPaperValues, PaperCorrector } from './paper-correction.ts';

export type PaperPair = { paperId: string; existingId: string };

const MARK_EXISTING_PAPER_SQL = `
  UPDATE documents
  SET driver_user_id = coalesce(driver_user_id, (SELECT driver_user_id FROM documents WHERE id = $2 AND workspace_id = $3)),
    stage = coalesce($4, stage), admin_corrected_at = $5
  WHERE id = $1 AND workspace_id = $3`;

export async function mergeIntoExistingPaper({ transaction, workspaceId, now }: PaperCorrector, { paperId, existingId }: PaperPair, values: NewPaperValues): Promise<void> {
  await transaction.query('UPDATE document_sources SET document_id = $3 WHERE document_id = $1 AND workspace_id = $2', [paperId, workspaceId, existingId]);
  await transaction.query(MARK_EXISTING_PAPER_SQL, [existingId, paperId, workspaceId, values.stage, now]);
  await transaction.query('DELETE FROM documents WHERE id = $1 AND workspace_id = $2', [paperId, workspaceId]);
}
