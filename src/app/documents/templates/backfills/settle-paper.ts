import type { Transaction } from '../../../db/transaction.ts';
import { pickMatchingDraft, type SavedPaper } from './pick-matching-draft.ts';
import type { PaperRead } from './read-backfill-paper.ts';
import { updatePaperFromDraft } from './update-paper-from-draft.ts';

export type PaperOutcome = 'updated' | 'unmatched' | 'skipped' | 'failed';

export type PaperTarget = { workspaceId: string; paperId: string; templateId: string };

type PaperRow = { issuer_key: string | null; document_number: string | null; document_date: string | null; vehicle_plate: string | null };

const LOCK_PAPER_SQL = `
  SELECT issuer_key, document_number, document_date::text AS document_date, vehicle_plate
  FROM documents
  WHERE id = $1 AND workspace_id = $2 AND status = 'accepted' AND admin_corrected_at IS NULL
  FOR UPDATE`;

export async function settlePaper(transaction: Transaction, target: PaperTarget, read: PaperRead): Promise<PaperOutcome> {
  if (read.kind !== 'read') return read.kind;
  const paper = await lockSavedPaper(transaction, target);
  if (paper === null) return 'skipped';
  const draft = pickMatchingDraft(read.drafts, paper, target.templateId);
  if (draft === null) return 'unmatched';
  await updatePaperFromDraft(transaction, { workspaceId: target.workspaceId, paperId: target.paperId, messageId: read.messageId }, draft);
  return 'updated';
}

async function lockSavedPaper(transaction: Transaction, { paperId, workspaceId }: PaperTarget): Promise<SavedPaper | null> {
  const [row] = await transaction.query<PaperRow>(LOCK_PAPER_SQL, [paperId, workspaceId]);
  if (row === undefined) return null;
  return { issuerKey: row.issuer_key, documentNumber: row.document_number, documentDate: row.document_date, vehiclePlate: row.vehicle_plate };
}
