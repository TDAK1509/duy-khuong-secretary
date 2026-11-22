import { runInTransaction, type Database, type Transaction } from '../../db/transaction.ts';
import { insertRows } from '../insert-row.ts';
import { lockWorkspaceRecords } from '../../records/lock-workspace-records.ts';
import { carryBackfillToRevision, NO_BACKFILL, queueTemplateBackfill, type QueuedBackfill } from './backfills/queue-template-backfill.ts';
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

export type SaveTemplateResult = { action: 'added' | 'updated'; templateId: string; revision: number; backfill: QueuedBackfill } | { action: 'too_many_templates' };

type ReadableField = Pick<TemplateField, 'name' | 'valueType' | 'unit'>;

type StoredTemplate = { id: string; revision: number; kind: string; stage: TemplateStage | null; issuerOrganizationId: string | null; fields: ReadableField[] };

type StoredRow = { id: string; revision: number; kind: string; stage: TemplateStage | null; issuer_organization_id: string | null; fields: ReadableField[] };

const FIND_TEMPLATE_SQL = `
  SELECT template.id, template.revision, template.kind, template.stage, template.issuer_organization_id,
    COALESCE(
      (SELECT json_agg(json_build_object('name', field.name, 'valueType', field.value_type, 'unit', field.unit) ORDER BY field.position)
       FROM document_template_fields field WHERE field.template_id = template.id),
      '[]'
    ) AS fields
  FROM document_templates template
  WHERE template.workspace_id = $1 AND template.name_key = $2`;

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
    const [row] = await transaction.query<StoredRow>(FIND_TEMPLATE_SQL, [template.workspaceId, template.nameKey]);
    return row === undefined ? addTemplate(transaction, template) : updateTemplate(transaction, template, toStoredTemplate(row));
  });
}

function toStoredTemplate(row: StoredRow): StoredTemplate {
  return { id: row.id, revision: row.revision, kind: row.kind, stage: row.stage, issuerOrganizationId: row.issuer_organization_id, fields: row.fields };
}

async function addTemplate(transaction: Transaction, template: NewDocumentTemplate): Promise<SaveTemplateResult> {
  const [counted] = await transaction.query<{ count: number }>(COUNT_TEMPLATES_SQL, [template.workspaceId]);
  if ((counted?.count ?? 0) >= MAX_TEMPLATES_PER_WORKSPACE) return { action: 'too_many_templates' };
  const [inserted] = await transaction.query<{ id: string }>(INSERT_TEMPLATE_SQL, [
    template.workspaceId, template.createdByUserId, template.name, template.nameKey, template.kind, template.issuerOrganizationId, template.description, template.stage,
  ]);
  if (inserted === undefined) throw new Error('A document template was not inserted');
  await insertFields(transaction, template, inserted.id);
  const backfill = await queueBackfill(transaction, template, { templateId: inserted.id, revision: 1 });
  return { action: 'added', templateId: inserted.id, revision: 1, backfill };
}

async function updateTemplate(transaction: Transaction, template: NewDocumentTemplate, stored: StoredTemplate): Promise<SaveTemplateResult> {
  const [updated] = await transaction.query<{ revision: number }>(UPDATE_TEMPLATE_SQL, [
    stored.id, template.workspaceId, template.name, template.kind, template.issuerOrganizationId, template.description, template.stage,
  ]);
  if (updated === undefined) throw new Error('A document template was not updated');
  await transaction.query('DELETE FROM document_template_fields WHERE template_id = $1 AND workspace_id = $2', [stored.id, template.workspaceId]);
  await insertFields(transaction, template, stored.id);
  const backfill = await requeueBackfill(transaction, template, stored, updated.revision);
  return { action: 'updated', templateId: stored.id, revision: updated.revision, backfill };
}

async function requeueBackfill(transaction: Transaction, template: NewDocumentTemplate, stored: StoredTemplate, revision: number): Promise<QueuedBackfill> {
  if (changesReading(template, stored)) return queueBackfill(transaction, template, { templateId: stored.id, revision });
  await carryBackfillToRevision(transaction, template.workspaceId, stored.id, revision);
  return NO_BACKFILL;
}

function changesReading(template: NewDocumentTemplate, stored: StoredTemplate): boolean {
  const sameFields = template.fields.length === stored.fields.length && template.fields.every((field, index) => isSameReadableField(field, stored.fields[index]));
  return template.kind !== stored.kind || template.stage !== stored.stage || template.issuerOrganizationId !== stored.issuerOrganizationId || !sameFields;
}

function isSameReadableField(field: TemplateField, stored: ReadableField | undefined): boolean {
  return stored !== undefined && field.name === stored.name && field.valueType === stored.valueType && field.unit === stored.unit;
}

function queueBackfill(transaction: Transaction, template: NewDocumentTemplate, saved: { templateId: string; revision: number }): Promise<QueuedBackfill> {
  const rule = { templateId: saved.templateId, issuerOrganizationId: template.issuerOrganizationId, kind: template.kind };
  return queueTemplateBackfill(transaction, { workspaceId: template.workspaceId, requestedByUserId: template.createdByUserId, rule, ...saved });
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
