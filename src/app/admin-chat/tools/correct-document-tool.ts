import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction, type Transaction } from '../../db/transaction.ts';
import { correctPaper } from '../../documents/corrections/correct-paper.ts';
import { findLastPhotoMessage } from '../../documents/corrections/find-last-photo-message.ts';
import { findPapersToCorrect, type FoundPapers } from '../../documents/corrections/find-papers-to-correct.ts';
import type { CorrectedPaper, FoundPaper, NewPaperValues, PaperCorrector } from '../../documents/corrections/paper-correction.ts';
import { lockWorkspaceRecords } from '../../records/lock-workspace-records.ts';
import { parseCorrectionRequest, type CorrectionRequest } from './correct-document-arguments.ts';
import { describeCorrectedPaper, describeFoundPaper } from './describe-correction.ts';
import { settlePrintedValue } from './settle-printed-value.ts';
import { collectAdminTypedTexts, refuseUntypedValues } from './refuse-untyped-values.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const LIST_LIMIT = 20;

type Decision = 'no_match' | 'several' | 'number_on_several' | 'printed_on_several' | 'apply';

const NOT_DONE_NOTES: Record<Exclude<Decision, 'apply'>, string> = {
  no_match: 'Không có giấy tờ đã lưu nào khớp. Chưa đổi gì.',
  several: 'Có nhiều giấy tờ khớp. Chưa đổi gì. Hỏi quản lý muốn sửa giấy tờ nào. Nếu quản lý muốn sửa tất cả, gọi lại với all_matching true.',
  number_on_several: 'Số giấy tờ mới chỉ đặt được cho một giấy tờ, mà có nhiều giấy tờ khớp. Chưa đổi gì. Hỏi quản lý muốn sửa giấy tờ nào.',
  printed_on_several: 'Giá trị in trên giấy chỉ đặt được cho một giấy tờ, mà có nhiều giấy tờ khớp. Chưa đổi gì. Hỏi quản lý muốn sửa giấy tờ nào.',
};

export async function runCorrectDocument(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const request = parseCorrectionRequest(parsedArguments);
  refuseUntypedValues(request.values, collectAdminTypedTexts(dependencies));
  const result = await runInTransaction(dependencies.database, (transaction) => correctInTransaction(transaction, dependencies, scope, request));
  return JSON.stringify(result);
}

async function correctInTransaction(transaction: Transaction, dependencies: AdminToolDependencies, scope: AccessScope, request: CorrectionRequest): Promise<Record<string, unknown>> {
  await lockWorkspaceRecords(transaction, scope.workspaceId);
  const found = await findRequestedPapers(transaction, dependencies, scope, request);
  const decision = decideCorrection(found, request);
  if (decision !== 'apply') return describeNotDone(decision, found);
  const values = { ...request.values, printed: await settlePrintedValue(transaction, scope.workspaceId, found.papers, request.values.printed) };
  const corrector = { transaction, workspaceId: scope.workspaceId, now: dependencies.clock.now() };
  const corrected = await correctEachPaper(corrector, found.papers, values);
  return { ok: true, action: 'corrected', papers: corrected.map((result) => describeCorrectedPaper(result, values)) };
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

function decideCorrection({ total }: FoundPapers, { values, allMatching }: CorrectionRequest): Decision {
  if (total === 0) return 'no_match';
  if (total === 1) return 'apply';
  if (values.documentNumber !== null) return 'number_on_several';
  if (values.printed !== null) return 'printed_on_several';
  return allMatching ? 'apply' : 'several';
}

function describeNotDone(decision: Exclude<Decision, 'apply'>, { papers, total }: FoundPapers): Record<string, unknown> {
  const action = decision === 'no_match' ? 'no_match' : 'ambiguous';
  return { ok: true, action, note: NOT_DONE_NOTES[decision], total, papers: papers.slice(0, LIST_LIMIT).map(describeFoundPaper) };
}
