import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction, type Transaction } from '../../db/transaction.ts';
import { correctPaper } from '../../documents/corrections/correct-paper.ts';
import { findLastPhotoMessage } from '../../documents/corrections/find-last-photo-message.ts';
import { findPapersToCorrect, type FoundPapers } from '../../documents/corrections/find-papers-to-correct.ts';
import type { CorrectedPaper, FoundPaper, NewPaperValues, PaperCorrector } from '../../documents/corrections/paper-correction.ts';
import { lockWorkspaceRecords } from '../../records/lock-workspace-records.ts';
import { chooseCompany, type ChosenCompany } from './choose-paper-company.ts';
import { parseCorrectionRequest, type CorrectionRequest } from './correct-document-arguments.ts';
import { describeCorrectedPaper, describeFoundPaper } from './describe-correction.ts';
import { settleCompany } from './settle-company.ts';
import { settlePrintedValue } from './settle-printed-value.ts';
import { collectAdminTypedTexts, refuseUntypedValues } from './refuse-untyped-values.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const LIST_LIMIT = 20;

type Decision = 'no_match' | 'several' | 'number_on_several' | 'printed_on_several' | 'company_on_several' | 'company_ambiguous' | 'apply';

type NotDoneDecision = Exclude<Decision, 'apply' | 'company_ambiguous'>;

const AMBIGUOUS_COMPANY_NOTE = 'Có nhiều công ty đã lưu khớp với tên quản lý nêu. Chưa đổi gì. Nêu từng công ty trong "companies" và hỏi quản lý muốn chọn công ty nào.';

const NOT_DONE_NOTES: Record<NotDoneDecision, string> = {
  no_match: 'Không có giấy tờ đã lưu nào khớp. Chưa đổi gì.',
  several: 'Có nhiều giấy tờ khớp. Chưa đổi gì. Hỏi quản lý muốn sửa giấy tờ nào. Nếu quản lý muốn sửa tất cả, gọi lại với all_matching true.',
  number_on_several: 'Số giấy tờ mới chỉ đặt được cho một giấy tờ, mà có nhiều giấy tờ khớp. Chưa đổi gì. Hỏi quản lý muốn sửa giấy tờ nào.',
  printed_on_several: 'Giá trị in trên giấy chỉ đặt được cho một giấy tờ, mà có nhiều giấy tờ khớp. Chưa đổi gì. Hỏi quản lý muốn sửa giấy tờ nào.',
  company_on_several: 'Công ty chỉ đặt được cho một giấy tờ, mà có nhiều giấy tờ khớp. Chưa đổi gì. Hỏi quản lý muốn sửa giấy tờ nào.',
};

export async function runCorrectDocument(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const request = parseCorrectionRequest(parsedArguments);
  refuseUntypedValues(request, collectAdminTypedTexts(dependencies));
  const chosen = await chooseCompany(dependencies, scope.workspaceId, request.company);
  const result = await runInTransaction(dependencies.database, (transaction) => correctInTransaction(transaction, dependencies, scope, { request, chosen }));
  return JSON.stringify(result);
}

type Correction = { request: CorrectionRequest; chosen: ChosenCompany | null };

async function correctInTransaction(transaction: Transaction, dependencies: AdminToolDependencies, scope: AccessScope, correction: Correction): Promise<Record<string, unknown>> {
  await lockWorkspaceRecords(transaction, scope.workspaceId);
  const found = await findRequestedPapers(transaction, dependencies, scope, correction.request);
  const decision = decideCorrection(found, correction);
  if (decision === 'company_ambiguous') return describeAmbiguousCompany(correction.chosen?.ambiguousNames ?? []);
  if (decision !== 'apply') return describeNotDone(decision, found);
  const values = await settleValues(transaction, scope.workspaceId, found.papers, correction);
  const corrector = { transaction, workspaceId: scope.workspaceId, now: dependencies.clock.now() };
  const corrected = await correctEachPaper(corrector, found.papers, values);
  return { ok: true, action: 'corrected', papers: corrected.map((result) => describeCorrectedPaper(result, values)) };
}

async function settleValues(transaction: Transaction, workspaceId: string, papers: FoundPaper[], { request, chosen }: Correction): Promise<NewPaperValues> {
  const printed = await settlePrintedValue(transaction, workspaceId, papers, request.values.printed);
  return { ...request.values, printed, company: settleCompany(papers[0], request.values.stage, chosen) };
}

async function correctEachPaper(corrector: PaperCorrector, papers: FoundPaper[], values: NewPaperValues): Promise<CorrectedPaper[]> {
  const corrected: CorrectedPaper[] = [];
  for (const paper of papers) corrected.push(await correctPaper(corrector, paper, values));
  return corrected;
}

async function findRequestedPapers(transaction: Transaction, dependencies: AdminToolDependencies, scope: AccessScope, request: CorrectionRequest): Promise<FoundPapers> {
  const lastPhotoMessageId = request.fromLastPhoto ? await findLastPhoto(transaction, dependencies, scope) : null;
  if (request.fromLastPhoto && lastPhotoMessageId === null) return { papers: [], total: 0 };
  return findPapersToCorrect(transaction, scope.workspaceId, { ...request.pointer, lastPhotoMessageId }, request.allMatching ? null : LIST_LIMIT);
}

async function findLastPhoto(transaction: Transaction, { currentMessageId }: AdminToolDependencies, scope: AccessScope): Promise<string | null> {
  if (!currentMessageId) return null;
  return findLastPhotoMessage(transaction, { workspaceId: scope.workspaceId, userId: scope.userId, currentMessageId });
}

function decideCorrection({ total }: FoundPapers, { request, chosen }: Correction): Decision {
  if (total === 0) return 'no_match';
  if (total === 1) return chosen !== null && chosen.ambiguousNames.length > 0 ? 'company_ambiguous' : 'apply';
  if (request.values.documentNumber !== null) return 'number_on_several';
  if (request.values.printed !== null) return 'printed_on_several';
  if (chosen !== null) return 'company_on_several';
  return request.allMatching ? 'apply' : 'several';
}

function describeNotDone(decision: NotDoneDecision, { papers, total }: FoundPapers): Record<string, unknown> {
  const action = decision === 'no_match' ? 'no_match' : 'ambiguous';
  return { ok: true, action, note: NOT_DONE_NOTES[decision], total, papers: papers.slice(0, LIST_LIMIT).map(describeFoundPaper) };
}

function describeAmbiguousCompany(companies: string[]): Record<string, unknown> {
  return { ok: true, action: 'ambiguous_company', note: AMBIGUOUS_COMPANY_NOTE, companies };
}
