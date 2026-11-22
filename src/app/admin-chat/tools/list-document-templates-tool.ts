import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction, type Database } from '../../db/transaction.ts';
import type { DocumentTemplate, TemplateField } from '../../document-templates/document-template.ts';
import { countPapersByTemplate, listDocumentTemplates } from '../../document-templates/list-document-templates.ts';
import { formatVietnamDate } from '../../time/format-vietnam-date.ts';
import { formatVietnamTime } from '../../time/format-vietnam-time.ts';

const argumentsSchema = z.strictObject({});

export async function runListDocumentTemplates(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  argumentsSchema.parse(parsedArguments);
  const { templates, papers } = await runInTransaction(database, async (transaction) => ({
    templates: await listDocumentTemplates(transaction, scope.workspaceId),
    papers: await countPapersByTemplate(transaction, scope.workspaceId),
  }));
  return JSON.stringify({ templates: templates.map((template) => describeTemplate(template, papers.get(template.id) ?? 0)) });
}

function describeTemplate(template: DocumentTemplate, papers: number): Record<string, unknown> {
  return {
    name: template.name,
    kind: template.kind,
    issuer_company: template.issuerName,
    stage: template.stage,
    description: template.description,
    fields: template.fields.map(describeField),
    revision: template.revision,
    papers,
    updated_at: `${formatVietnamTime(template.updatedAt)} ${formatVietnamDate(template.updatedAt)}`,
  };
}

function describeField({ name, valueType, unit, required }: TemplateField): Record<string, unknown> {
  return { name, type: valueType, unit, required };
}
