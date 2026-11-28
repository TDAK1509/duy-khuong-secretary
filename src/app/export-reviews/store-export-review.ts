import type { Transaction } from '../db/transaction.ts';
import type { FileClaim } from '../sheet-files/file-claims.ts';
import type { CellChange } from './list-changed-cells.ts';

export type ReviewedChange = { exportRowId: string; change: CellChange };

const INSERT_REVIEW_SQL = `
  INSERT INTO company_export_reviews (workspace_id, export_id, message_file_id, status) VALUES ($1, $2, $3, 'pending')
  ON CONFLICT (message_file_id) DO NOTHING RETURNING id`;

const INSERT_CHANGES_SQL = `
  INSERT INTO company_export_review_changes (workspace_id, review_id, export_row_id, column_key, value_type, before_value, after_value, suggested_cause, candidate_actions, status)
  SELECT $1, $2, change.export_row_id, change.column_key, change.value_type, change.before_value, change.after_value, 'unclear', '[]'::jsonb, 'unsupported'
  FROM jsonb_to_recordset($3::jsonb) AS change(export_row_id uuid, column_key text, value_type text, before_value jsonb, after_value jsonb)`;

export async function storeExportReview(transaction: Transaction, claim: FileClaim, exportId: string, changes: ReviewedChange[]): Promise<void> {
  const [review] = await transaction.query<{ id: string }>(INSERT_REVIEW_SQL, [claim.workspaceId, exportId, claim.fileId]);
  if (review === undefined) return;
  await transaction.query(INSERT_CHANGES_SQL, [claim.workspaceId, review.id, JSON.stringify(changes.map(describeChange))]);
}

function describeChange({ exportRowId, change }: ReviewedChange) {
  return { export_row_id: exportRowId, column_key: change.columnKey, value_type: change.valueType, before_value: change.before, after_value: change.after };
}
