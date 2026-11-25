import type { Transaction } from '../../db/transaction.ts';
import { linkDocumentToMatchingFacts } from '../../facts/link-facts.ts';
import { listPaperChanges, resolveFinalValues } from './list-paper-changes.ts';
import { mergeIntoExistingPaper } from './merge-into-existing-paper.ts';
import type { CorrectedPaper, FoundPaper, NewPaperValues, PaperCorrector } from './paper-correction.ts';
import { updateSourceRecords } from './update-source-records.ts';

const FIND_SAME_PAPER_SQL = `
  SELECT existing.id
  FROM documents paper
  JOIN documents existing ON existing.workspace_id = paper.workspace_id AND existing.id <> paper.id AND existing.status = 'accepted'
    AND existing.issuer_key = paper.issuer_key AND existing.document_number = $3 AND existing.document_date = $4::date
    AND coalesce(existing.vehicle_plate, '') = coalesce($5, '')
  WHERE paper.id = $1 AND paper.workspace_id = $2`;

const UPDATE_PAPER_SQL = `
  UPDATE documents
  SET vehicle_plate = coalesce($3, vehicle_plate), document_number = coalesce($4, document_number),
    document_date = coalesce($5::date, document_date), stage = coalesce($6, stage), admin_corrected_at = $7
  WHERE id = $1 AND workspace_id = $2`;

export async function correctPaper(corrector: PaperCorrector, paper: FoundPaper, values: NewPaperValues): Promise<CorrectedPaper> {
  const { transaction, workspaceId } = corrector;
  await updateSourceRecords(transaction, workspaceId, paper.id, values);
  const changes = listPaperChanges(paper, values);
  if (changes.length === 0) return { paper, changes, mergedIntoId: null };
  const existingId = await findSamePaper(corrector, paper, values);
  if (existingId === null) await updatePaper(corrector, paper.id, values);
  else await mergeIntoExistingPaper(corrector, { paperId: paper.id, existingId }, values);
  await relinkPaperFacts(transaction, workspaceId, existingId ?? paper.id);
  return { paper, changes, mergedIntoId: existingId };
}

async function findSamePaper({ transaction, workspaceId }: PaperCorrector, paper: FoundPaper, values: NewPaperValues): Promise<string | null> {
  const final = resolveFinalValues(paper, values);
  const [row] = await transaction.query<{ id: string }>(FIND_SAME_PAPER_SQL, [paper.id, workspaceId, final.documentNumber, final.documentDate, final.plate]);
  return row?.id ?? null;
}

async function updatePaper({ transaction, workspaceId, now }: PaperCorrector, paperId: string, values: NewPaperValues): Promise<void> {
  await transaction.query(UPDATE_PAPER_SQL, [paperId, workspaceId, values.plate, values.documentNumber, values.documentDate, values.stage, now]);
}

async function relinkPaperFacts(transaction: Transaction, workspaceId: string, paperId: string): Promise<void> {
  await transaction.query('DELETE FROM document_facts WHERE workspace_id = $1 AND document_id = $2', [workspaceId, paperId]);
  await linkDocumentToMatchingFacts(transaction, workspaceId, paperId);
}
