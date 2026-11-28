import type { Transaction } from '../../db/transaction.ts';
import type { DocumentTemplate } from './document-template.ts';

const LIST_TEMPLATES_SQL = `
  SELECT template.id, template.name, template.kind, organization.name AS issuer_name, template.description, template.stage, template.revision, template.updated_at,
    COALESCE(
      (SELECT json_agg(json_build_object('name', field.name, 'nameKey', field.name_key, 'valueType', field.value_type, 'unit', field.unit, 'required', field.required) ORDER BY field.position)
       FROM document_template_fields field WHERE field.template_id = template.id),
      '[]'
    ) AS fields,
    COALESCE(
      (SELECT json_agg(json_build_object('position', example.position, 'paperId', example.source_document_id) ORDER BY example.position)
       FROM document_template_examples example WHERE example.template_id = template.id),
      '[]'
    ) AS examples
  FROM document_templates template
  LEFT JOIN organizations organization ON organization.id = template.issuer_organization_id AND organization.workspace_id = template.workspace_id
  WHERE template.workspace_id = $1
  ORDER BY template.name COLLATE "C", template.id`;

const COUNT_PAPERS_SQL = `
  SELECT document.template_id, count(*)::int AS paper_count
  FROM documents document
  WHERE document.workspace_id = $1 AND document.template_id IS NOT NULL
  GROUP BY document.template_id`;

type TemplateRow = Omit<DocumentTemplate, 'issuerName' | 'updatedAt'> & { issuer_name: string | null; updated_at: Date };

export async function listDocumentTemplates(transaction: Transaction, workspaceId: string): Promise<DocumentTemplate[]> {
  const rows = await transaction.query<TemplateRow>(LIST_TEMPLATES_SQL, [workspaceId]);
  return rows.map(({ issuer_name: issuerName, updated_at: updatedAt, ...template }) => ({ ...template, issuerName, updatedAt }));
}

export async function countPapersByTemplate(transaction: Transaction, workspaceId: string): Promise<Map<string, number>> {
  const rows = await transaction.query<{ template_id: string; paper_count: number }>(COUNT_PAPERS_SQL, [workspaceId]);
  return new Map(rows.map((row) => [row.template_id, row.paper_count]));
}
