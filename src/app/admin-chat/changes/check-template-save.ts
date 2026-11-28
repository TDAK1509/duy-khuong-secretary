import { runInTransaction, type Database } from '../../db/transaction.ts';
import { estimateCredits, findCreditRangePerPaper } from '../../documents/templates/backfills/estimate-backfill-credits.ts';
import { findBackfillCandidates } from '../../documents/templates/backfills/find-backfill-candidates.ts';
import type { TemplateField } from '../../documents/templates/document-template.ts';
import { describeSavedPaper, findSavedPapers } from '../../documents/saved-papers.ts';
import { findExamplePapers } from '../../documents/templates/find-example-papers.ts';
import { resolveTemplateIssuer, type TemplateIssuer } from '../tools/document-template-issuer.ts';
import { checkTemplateArguments, EXAMPLE_NOT_FOUND_ERROR, type SaveArguments } from '../tools/save-document-template-tool.ts';
import { ToolRefusal } from '../tools/tool-result.ts';
import type { RiskyChecker } from './risky-check.ts';

const STAGE_LABELS = { dispatch: 'lấy hàng', receipt: 'đổ hàng' };
const NO_STAGE_LABEL = 'chưa chọn';
const NO_ISSUER_LABEL = 'không có';
const UNMATCHED_ISSUER_LABEL = 'chưa khớp công ty nào đã lưu';
const NO_FIELDS_LABEL = 'chưa có trường nào';

export const checkTemplateSave: RiskyChecker = async ({ database }, scope, parsedArguments) => {
  const { request, checked } = checkTemplateArguments(parsedArguments);
  const issuer = await resolveTemplateIssuer(database, scope.workspaceId, request.issuer_company);
  const examples = await describeExamples(database, scope.workspaceId, checked.examplePaperIds);
  const draft = [
    `Lưu mẫu giấy tờ "${checked.name}": loại ${checked.kind}, giai đoạn ${describeStage(request.stage)}, công ty phát hành ${describeIssuer(request, issuer)}.`,
    `Các trường: ${describeFields(checked.fields)}.`,
    `Giấy tờ ví dụ: ${examples}.`,
  ];
  return { targets: null, writeQuestion: async () => [...draft, await describeReread(database, scope.workspaceId, { issuer, kind: checked.kind })].join('\n') };
};

function describeStage(stage: SaveArguments['stage']): string {
  return stage === null ? NO_STAGE_LABEL : STAGE_LABELS[stage];
}

function describeIssuer({ issuer_company: named }: SaveArguments, { matchedName }: TemplateIssuer): string {
  if (matchedName !== null) return matchedName;
  return named === null ? NO_ISSUER_LABEL : UNMATCHED_ISSUER_LABEL;
}

function describeFields(fields: TemplateField[]): string {
  return fields.length === 0 ? NO_FIELDS_LABEL : fields.map(describeField).join(', ');
}

function describeField({ name, valueType, unit, required }: TemplateField): string {
  const details = [valueType, ...(unit === null ? [] : [unit]), ...(required ? ['bắt buộc'] : [])];
  return `${name} (${details.join(', ')})`;
}

async function describeExamples(database: Database, workspaceId: string, paperIds: string[]): Promise<string> {
  return runInTransaction(database, (transaction) =>
    transaction.withScope({ workspaceId }, async () => {
      const { unusableIds } = await findExamplePapers(transaction, workspaceId, paperIds);
      const papers = unusableIds.length === 0 ? await findSavedPapers(transaction, workspaceId, paperIds) : null;
      if (papers === null) throw new ToolRefusal(EXAMPLE_NOT_FOUND_ERROR);
      return papers.map(describeSavedPaper).join('; ');
    }),
  );
}

async function describeReread(database: Database, workspaceId: string, { issuer, kind }: { issuer: TemplateIssuer; kind: string }): Promise<string> {
  return runInTransaction(database, async (transaction) => {
    const { documentIds } = await findBackfillCandidates(transaction, workspaceId, { templateId: null, issuerOrganizationId: issuer.organizationId, kind });
    if (documentIds.length === 0) return 'Không có giấy tờ đã lưu nào cần đọc lại.';
    const credits = estimateCredits(await findCreditRangePerPaper(transaction, workspaceId), documentIds.length);
    const cost = credits === null ? '' : `, tốn khoảng ${credits.min} đến ${credits.max} credit`;
    return `${documentIds.length} giấy tờ đã lưu sẽ được đọc lại${cost}.`;
  });
}
