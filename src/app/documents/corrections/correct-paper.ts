import type { Transaction } from '../../db/transaction.ts';
import { linkDocumentToMatchingEntries } from '../../facts/link-facts.ts';
import { resolveCompanyTarget, type CompanyTarget } from './company-target.ts';
import { findPrintedLine, type PrintedLine } from './find-printed-line.ts';
import { listPaperChanges, resolveFinalValues, type ValuesBefore } from './list-paper-changes.ts';
import { mergeIntoExistingPaper } from './merge-into-existing-paper.ts';
import type { CorrectedPaper, FoundPaper, NewPaperValues, PaperCorrector } from './paper-correction.ts';
import { setPaperCompany } from './set-paper-company.ts';
import { setPrintedValue } from './set-printed-value.ts';
import { updateSourceRecords } from './update-source-records.ts';

const FIND_SAME_PAPER_SQL = `
  SELECT existing.id
  FROM documents paper
  JOIN documents existing ON existing.workspace_id = paper.workspace_id AND existing.id <> paper.id AND existing.status = 'accepted'
    AND existing.issuer_key = coalesce($6, paper.issuer_key) AND existing.document_number = $3 AND existing.document_date = $4::date
    AND coalesce(existing.vehicle_plate, '') = coalesce($5, '')
  WHERE paper.id = $1 AND paper.workspace_id = $2`;

const UPDATE_PAPER_SQL = `
  UPDATE documents
  SET vehicle_plate = coalesce($3, vehicle_plate), document_number = coalesce($4, document_number),
    document_date = coalesce($5::date, document_date), stage = coalesce($6, stage), admin_corrected_at = $7,
    issuer_key = coalesce($8, issuer_key)
  WHERE id = $1 AND workspace_id = $2`;

export async function correctPaper(corrector: PaperCorrector, paper: FoundPaper, values: NewPaperValues): Promise<CorrectedPaper> {
  const { transaction, workspaceId } = corrector;
  await updateSourceRecords(transaction, workspaceId, paper.id, values);
  const before = await readValuesBefore(corrector, paper.id, values);
  const changes = listPaperChanges(paper, values, before);
  if (changes.length === 0) return { paper, changes, mergedIntoId: null };
  const existingId = await storeCorrection(corrector, paper, values, before.company);
  await relinkPaperEntries(transaction, workspaceId, existingId ?? paper.id);
  return { paper, changes, mergedIntoId: existingId };
}

async function readValuesBefore(corrector: PaperCorrector, paperId: string, values: NewPaperValues): Promise<ValuesBefore> {
  const printed = await findPrintedLineBefore(corrector.transaction, corrector.workspaceId, paperId, values);
  const company = values.company === null ? null : await resolveCompanyTarget(corrector, paperId, values.company);
  return { printed, company };
}

async function findPrintedLineBefore(transaction: Transaction, workspaceId: string, paperId: string, { printed }: NewPaperValues): Promise<PrintedLine | null> {
  return printed === null ? null : findPrintedLine(transaction, workspaceId, paperId, printed);
}

async function storeCorrection(corrector: PaperCorrector, paper: FoundPaper, values: NewPaperValues, company: CompanyTarget | null): Promise<string | null> {
  const issuerKey = company?.issuerKey ?? null;
  const existingId = await findSamePaper(corrector, paper, values, issuerKey);
  if (existingId === null) await updatePaper(corrector, paper.id, values, issuerKey);
  else await mergeIntoExistingPaper(corrector, { paperId: paper.id, existingId }, values);
  await setPrintedAndCompany(corrector, existingId ?? paper.id, values, company);
  return existingId;
}

async function setPrintedAndCompany(corrector: PaperCorrector, paperId: string, values: NewPaperValues, company: CompanyTarget | null): Promise<void> {
  if (values.printed !== null) await setPrintedValue(corrector, paperId, values.printed);
  if (values.company !== null && company !== null) await setPaperCompany(corrector, paperId, values.company.roles, company);
}

async function findSamePaper({ transaction, workspaceId }: PaperCorrector, paper: FoundPaper, values: NewPaperValues, issuerKey: string | null): Promise<string | null> {
  const final = resolveFinalValues(paper, values);
  const [row] = await transaction.query<{ id: string }>(FIND_SAME_PAPER_SQL, [paper.id, workspaceId, final.documentNumber, final.documentDate, final.plate, issuerKey]);
  return row?.id ?? null;
}

async function updatePaper({ transaction, workspaceId, now }: PaperCorrector, paperId: string, values: NewPaperValues, issuerKey: string | null): Promise<void> {
  await transaction.query(UPDATE_PAPER_SQL, [paperId, workspaceId, values.plate, values.documentNumber, values.documentDate, values.stage, now, issuerKey]);
}

async function relinkPaperEntries(transaction: Transaction, workspaceId: string, paperId: string): Promise<void> {
  await transaction.query('DELETE FROM company_knowledge_links WHERE workspace_id = $1 AND document_id = $2', [workspaceId, paperId]);
  await linkDocumentToMatchingEntries(transaction, workspaceId, paperId);
}
