import { runInTransaction, type Database } from '../../db/transaction.ts';
import { lockWorkspaceRecords } from '../../records/lock-workspace-records.ts';

export type DeletedTemplate = { name: string; kind: string; paperCount: number };

type DeletedRow = { id: string; name: string; kind: string; paper_count: number };

const DESCRIBE_TEMPLATE_SQL = `
  SELECT template.id, template.name, template.kind,
    (SELECT count(*) FROM documents document WHERE document.workspace_id = template.workspace_id AND document.template_id = template.id)::int AS paper_count
  FROM document_templates template
  WHERE template.workspace_id = $1 AND template.name_key = $2`;

export function deleteDocumentTemplate(database: Database, workspaceId: string, nameKey: string): Promise<DeletedTemplate | null> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, workspaceId);
    const [row] = await transaction.query<DeletedRow>(DESCRIBE_TEMPLATE_SQL, [workspaceId, nameKey]);
    if (row === undefined) return null;
    await transaction.query('DELETE FROM document_templates WHERE id = $1 AND workspace_id = $2', [row.id, workspaceId]);
    return { name: row.name, kind: row.kind, paperCount: row.paper_count };
  });
}
