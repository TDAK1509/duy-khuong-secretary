import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction, type Transaction } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { correctPaper } from '../../documents/corrections/correct-paper.ts';
import type { CompanyClaim, FoundPaper, NewPaperValues, PrintedValue } from '../../documents/corrections/paper-correction.ts';
import { formatKilograms } from '../../documents/corrections/weight-units.ts';
import type { PaperCorrection } from '../../export-reviews/build-change-candidates.ts';
import { findPaperById } from '../../export-reviews/find-paper-by-id.ts';
import { isPaperValueUnchanged } from '../../export-reviews/is-paper-value-unchanged.ts';
import { markChanges, type ReviewChange } from '../../export-reviews/review-changes.ts';
import { WEIGHT_MEANING } from '../../facts/knowledge-totals.ts';
import type { CompanySlot } from '../../facts/pick-fact-companies.ts';
import { lockWorkspaceRecords } from '../../records/lock-workspace-records.ts';
import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import { chooseOrganizationId } from './choose-paper-company.ts';
import { applyLoadWeightRules } from './load-weight-rules.ts';
import { RejectedExportChange } from './rejected-export-change.ts';
import { requireCompanyRoles, settleCompany, type PickedCompany } from './settle-company.ts';
import { settlePrintedValue } from './settle-printed-value.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { readPlateArgument } from './vehicle-plate.ts';

const NONZERO_DIGIT = /[1-9]/;

const NO_VALUES: NewPaperValues = { plate: null, documentNumber: null, documentDate: null, stage: null, printed: null, company: null };

const COMPANY_SLOTS: readonly string[] = ['pickup', 'dropoff', 'customer'];

type CorrectionRequest = { change: ReviewChange; correction: PaperCorrection; picked: PickedCompany | null };

type WriteContext = { dependencies: AdminToolDependencies; scope: AccessScope };

export async function applyPaperCorrection(dependencies: AdminToolDependencies, scope: AccessScope, change: ReviewChange, correction: PaperCorrection): Promise<void> {
  const paper = await runInTransaction(dependencies.database, (transaction) => findPaperById(transaction, scope.workspaceId, correction.document_id));
  if (paper === null) throw new RejectedExportChange('paper_missing');
  const picked = await pickCompany(dependencies, scope, paper, correction);
  await runInTransaction(dependencies.database, (transaction) => correctInTransaction(transaction, { dependencies, scope }, { change, correction, picked }));
}

async function pickCompany(dependencies: AdminToolDependencies, scope: AccessScope, paper: FoundPaper, correction: PaperCorrection): Promise<PickedCompany | null> {
  const claim = readCompanyClaim(correction);
  if (claim === null) return null;
  requireCompanyRoles(paper, null, claim);
  return { organizationId: await chooseOrganizationId(dependencies, scope.workspaceId, claim) };
}

function readCompanyClaim({ field, value }: PaperCorrection): CompanyClaim | null {
  if (!COMPANY_SLOTS.includes(field)) return null;
  if (typeof value !== 'string' || buildMatchKey(value) === '') throw new RejectedExportChange('invalid_value');
  return { slot: field as CompanySlot, name: value.trim() };
}

async function correctInTransaction(transaction: Transaction, { dependencies, scope }: WriteContext, request: CorrectionRequest): Promise<void> {
  await lockWorkspaceRecords(transaction, scope.workspaceId);
  const paper = await findPaperById(transaction, scope.workspaceId, request.correction.document_id);
  if (paper === null) throw new RejectedExportChange('paper_missing');
  await requireUnchangedValue(transaction, { workspaceId: scope.workspaceId, paper }, request);
  const values = await buildPaperValues(transaction, { workspaceId: scope.workspaceId, paper }, request);
  await correctPaper({ transaction, workspaceId: scope.workspaceId, now: dependencies.clock.now() }, paper, values);
  await markChanges(transaction, scope.workspaceId, [request.change.id], 'applied');
}

type PaperTarget = { workspaceId: string; paper: FoundPaper };

async function requireUnchangedValue(transaction: Transaction, { workspaceId, paper }: PaperTarget, { change, correction }: CorrectionRequest): Promise<void> {
  const isUnchanged = await isPaperValueUnchanged(transaction, workspaceId, paper, { field: correction.field, before: change.before });
  if (!isUnchanged) throw new RejectedExportChange('stale');
}

async function buildPaperValues(transaction: Transaction, target: PaperTarget, { correction, picked }: CorrectionRequest): Promise<NewPaperValues> {
  const { field, value } = correction;
  if (field === 'weight' || field === 'goods') return { ...NO_VALUES, printed: await settlePrintedValue(transaction, target.workspaceId, [target.paper], buildPrinted(field, value)) };
  if (field === 'plate') return { ...NO_VALUES, plate: readPlateArgument(String(value)) };
  if (field === 'date') return { ...NO_VALUES, documentDate: readDate(value) };
  if (field === 'number') return { ...NO_VALUES, documentNumber: readNumber(value) };
  return { ...NO_VALUES, company: settleCompany(target.paper, null, { slot: field, name: String(value).trim() }, picked) };
}

function buildPrinted(field: 'weight' | 'goods', value: string | number): PrintedValue {
  if (field === 'goods') return { label: 'Hàng hóa', value: String(value), meaning: null, number: null, unit: null, typedNumber: null };
  const kilograms = Number(value);
  return applyLoadWeightRules({ label: WEIGHT_MEANING, value: formatKilograms(kilograms), meaning: WEIGHT_MEANING, number: kilograms, unit: 'kg', typedNumber: kilograms });
}

function readDate(value: string | number): string {
  if (typeof value !== 'string' || !isRealIsoDate(value)) throw new RejectedExportChange('invalid_value');
  return value;
}

function readNumber(value: string | number): string {
  const number = String(value).toUpperCase().replace(/[\s.\-_/]/g, '');
  if (!NONZERO_DIGIT.test(number)) throw new RejectedExportChange('invalid_value');
  return number;
}
