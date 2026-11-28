import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { MAX_TEMPLATES_PER_WORKSPACE, type TemplateField } from '../../documents/templates/document-template.ts';
import { saveDocumentTemplate, type NewDocumentTemplate, type SaveTemplateResult } from '../../documents/templates/save-document-template.ts';
import { MAX_BACKFILL_PAPERS } from '../../documents/templates/backfills/find-backfill-candidates.ts';
import { fieldArgumentSchema, readExamplePaperIds, readTemplateDescription, readTemplateFields, readTemplateKind, readTemplateName } from './document-template-arguments.ts';
import type { QueuedBackfill } from '../../documents/templates/backfills/queue-template-backfill.ts';
import { resolveTemplateIssuer, type TemplateIssuer } from './document-template-issuer.ts';
import { failTool } from './tool-result.ts';

const TOO_MANY_TEMPLATES_ERROR = `Nhóm đã có ${MAX_TEMPLATES_PER_WORKSPACE} mẫu, chưa lưu mẫu mới. Hỏi quản lý muốn xóa mẫu nào.`;
const EXAMPLE_NOT_FOUND_ERROR = 'Không tìm thấy giấy tờ này.';
const ISSUER_NOT_MATCHED_NOTE = 'Không khớp công ty nào đã lưu với tên công ty phát hành, nên mẫu chưa gắn với công ty. Nói rõ điều này với quản lý.';

const argumentsSchema = z.strictObject({
  name: z.string(),
  kind: z.string(),
  issuer_company: z.string().nullable(),
  stage: z.enum(['dispatch', 'receipt']).nullable(),
  description: z.string(),
  fields: z.array(fieldArgumentSchema),
  example_paper_ids: z.array(z.string()),
});

export type SaveArguments = z.infer<typeof argumentsSchema>;

export async function runSaveDocumentTemplate(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { request, checked } = checkTemplateArguments(parsedArguments);
  const issuer = await resolveTemplateIssuer(database, scope.workspaceId, request.issuer_company);
  const template = { workspaceId: scope.workspaceId, createdByUserId: scope.userId, ...checked, issuerOrganizationId: issuer.organizationId, stage: request.stage };
  const result = await saveDocumentTemplate(database, template);
  return describeSaveResult(result, template, { issuer, wasIssuerNamed: request.issuer_company !== null });
}

type CheckedTemplate = Pick<NewDocumentTemplate, 'name' | 'nameKey' | 'kind' | 'description' | 'fields' | 'examplePaperIds'>;

export function checkTemplateArguments(parsedArguments: unknown): { request: SaveArguments; checked: CheckedTemplate } {
  const request = argumentsSchema.parse(parsedArguments);
  const checked = {
    ...readTemplateName(request.name),
    kind: readTemplateKind(request.kind),
    description: readTemplateDescription(request.description),
    fields: readTemplateFields(request.fields),
    examplePaperIds: readExamplePaperIds(request.example_paper_ids),
  };
  return { request, checked };
}

type IssuerOutcome = { issuer: TemplateIssuer; wasIssuerNamed: boolean };

function describeSaveResult(result: SaveTemplateResult, template: NewDocumentTemplate, { issuer, wasIssuerNamed }: IssuerOutcome): string {
  if (result.action === 'too_many_templates') return failTool(TOO_MANY_TEMPLATES_ERROR);
  if (result.action === 'unusable_examples') return failTool(EXAMPLE_NOT_FOUND_ERROR);
  const unmatchedIssuer = wasIssuerNamed && issuer.matchedName === null;
  return JSON.stringify({
    ok: true,
    action: result.action,
    revision: result.revision,
    ...describeBackfill(result.backfill),
    template: { name: template.name, kind: template.kind, stage: template.stage, description: template.description, fields: template.fields.map(describeField) },
    issuer_company_matched: issuer.matchedName,
    ...(unmatchedIssuer ? { note: ISSUER_NOT_MATCHED_NOTE } : {}),
  });
}

function describeBackfill({ isStarted, paperCount, isCapped }: QueuedBackfill): Record<string, unknown> {
  if (!isStarted) return { reread_started: false };
  return { reread_started: true, papers_to_reread: paperCount, ...(isCapped ? { reread_note: `Chỉ đọc lại ${MAX_BACKFILL_PAPERS} giấy tờ mới nhất. Nói rõ điều này với quản lý.` } : {}) };
}

function describeField({ name, valueType, unit, required }: TemplateField): Record<string, unknown> {
  return { name, type: valueType, unit, required };
}
