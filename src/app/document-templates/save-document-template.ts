import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { insertRows } from '../documents/insert-row.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { MAX_TEMPLATES_PER_WORKSPACE, type TemplateField, type TemplateStage } from './document-template.ts';

export type NewDocumentTemplate = {
  workspaceId: string;
  createdByUserId: string;
  name: string;
  nameKey: string;
  kind: string;
  issuerOrganizationId: string | null;
  description: string;
  stage: TemplateStage | null;
  fields: TemplateField[];
};

export type SaveTemplateResult = { action: 'added' | 'updated'; templateId: string; revision: number } | { action: 'too_many_templates' };

type StoredTemplate = { id: string; revision: number };

const FIND_TEMPLATE_SQL = 'SELECT id, revision FROM document_templates WHERE workspace_id = $1 AND name_key = $2';
const COUNT_TEMPLATES_SQL = 'SELECT count(*)::int AS count FROM document_templates WHERE workspace_id = $1';

const INSERT_TEMPLATE_SQL = `
  INSERT INTO document_templates (workspace_id, created_by_user_id, name, name_key, kind, issuer_organization_id, description, stage)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING id`;

const UPDATE_TEMPLATE_SQL = `
  UPDATE document_templates
  SET name = $3, kind = $4, issuer_organization_id = $5, description = $6, stage = $7, revision = revision + 1, updated_at = now()
  WHERE id = $1 AND workspace_id = $2
  RETURNING revision`;

export function saveDocumentTemplate(database: Database, template: NewDocumentTemplate): Promise<SaveTemplateResult> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, template.workspaceId);
    const [stored] = await transaction.query<StoredTemplate>(FIND_TEMPLATE_SQL, [template.workspaceId, template.nameKey]);
    return stored === undefined ? addTemplate(transaction, template) : updateTemplate(transaction, template, stored);
  });
}

async function addTemplate(transaction: Transaction, template: NewDocumentTemplate): Promise<SaveTemplateResult> {
  const [counted] = await transaction.query<{ count: number }>(COUNT_TEMPLATES_SQL, [template.workspaceId]);
  if ((counted?.count ?? 0) >= MAX_TEMPLATES_PER_WORKSPACE) return { action: 'too_many_templates' };
  const [inserted] = await transaction.query<{ id: string }>(INSERT_TEMPLATE_SQL, [
    template.workspaceId, template.createdByUserId, template.name, template.nameKey, template.kind, template.issuerOrganizationId, template.description, template.stage,
  ]);
  if (inserted === undefined) throw new Error('A document template was not inserted');
  await insertFields(transaction, template, inserted.id);
  return { action: 'added', templateId: inserted.id, revision: 1 };
}

async function updateTemplate(transaction: Transaction, template: NewDocumentTemplate, stored: StoredTemplate): Promise<SaveTemplateResult> {
  const [updated] = await transaction.query<{ revision: number }>(UPDATE_TEMPLATE_SQL, [
    stored.id, template.workspaceId, template.name, template.kind, template.issuerOrganizationId, template.description, template.stage,
  ]);
  if (updated === undefined) throw new Error('A document template was not updated');
  await transaction.query('DELETE FROM document_template_fields WHERE template_id = $1 AND workspace_id = $2', [stored.id, template.workspaceId]);
  await insertFields(transaction, template, stored.id);
  return { action: 'updated', templateId: stored.id, revision: updated.revision };
}

async function insertFields(transaction: Transaction, template: NewDocumentTemplate, templateId: string): Promise<void> {
  const rows = template.fields.map((field, index) => ({
    workspace_id: template.workspaceId,
    template_id: templateId,
    position: index + 1,
    name: field.name,
    name_key: field.nameKey,
    value_type: field.valueType,
    unit: field.unit,
    required: field.required,
  }));
  await insertRows(transaction, 'document_template_fields', rows);
}
