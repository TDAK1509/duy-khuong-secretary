import type { Transaction } from '../db/transaction.ts';
import type { CellSource, CellValue, ValueType } from '../documents/recorded-export.ts';
import type { CandidateAction } from './build-change-candidates.ts';
import type { SuggestedCause } from './suggest-cause.ts';

export type ChangeStatus = 'pending' | 'applied' | 'dismissed' | 'unsupported';

export type ReviewChange = {
  id: string;
  reviewId: string;
  rowNumber: number;
  columnKey: string;
  columnName: string;
  valueType: ValueType;
  before: CellValue;
  after: CellValue;
  source: CellSource | null;
  suggestedCause: SuggestedCause;
  candidates: CandidateAction[];
  status: ChangeStatus;
};

const SELECT_CHANGES_SQL = `
  SELECT change.id, change.review_id AS "reviewId", export_row.row_number AS "rowNumber", change.column_key AS "columnKey",
    coalesce((SELECT column_definition ->> 'name' FROM jsonb_array_elements(export.columns) column_definition WHERE column_definition ->> 'key' = change.column_key), change.column_key) AS "columnName",
    change.value_type AS "valueType", change.before_value AS before, change.after_value AS after, export_row.cells -> change.column_key -> 'source' AS source,
    change.suggested_cause AS "suggestedCause", change.candidate_actions AS candidates, change.status
  FROM company_export_review_changes change
  JOIN company_export_reviews review ON review.id = change.review_id AND review.workspace_id = change.workspace_id
  JOIN company_exports export ON export.id = review.export_id AND export.workspace_id = review.workspace_id
  JOIN company_export_rows export_row ON export_row.id = change.export_row_id AND export_row.workspace_id = change.workspace_id
  WHERE change.workspace_id = $1 AND review.status = 'pending'`;

export async function listNewestReviewChanges(transaction: Transaction, workspaceId: string): Promise<ReviewChange[]> {
  return transaction.query<ReviewChange>(
    `${SELECT_CHANGES_SQL} AND review.id = (SELECT newest.id FROM company_export_reviews newest WHERE newest.workspace_id = $1 AND newest.status = 'pending' ORDER BY newest.created_at DESC, newest.id DESC LIMIT 1)
     ORDER BY export_row.row_number, change.column_key`,
    [workspaceId],
  );
}

export async function listReviewChangesOf(transaction: Transaction, workspaceId: string, changeId: string): Promise<ReviewChange[]> {
  return transaction.query<ReviewChange>(
    `${SELECT_CHANGES_SQL} AND change.review_id = (SELECT target.review_id FROM company_export_review_changes target WHERE target.id = $2 AND target.workspace_id = $1)
     ORDER BY export_row.row_number, change.column_key`,
    [workspaceId, changeId],
  );
}

export async function markChanges(transaction: Transaction, workspaceId: string, changeIds: string[], status: 'applied' | 'dismissed'): Promise<void> {
  await transaction.query(`UPDATE company_export_review_changes SET status = $3 WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND status = 'pending'`, [workspaceId, changeIds, status]);
  await transaction.query(COMPLETE_REVIEW_SQL, [workspaceId, changeIds]);
}

const COMPLETE_REVIEW_SQL = `
  UPDATE company_export_reviews review SET status = 'applied', applied_at = now()
  WHERE review.workspace_id = $1 AND review.status = 'pending'
    AND review.id IN (SELECT change.review_id FROM company_export_review_changes change WHERE change.id = ANY($2::uuid[]))
    AND NOT EXISTS (SELECT 1 FROM company_export_review_changes open WHERE open.review_id = review.id AND open.status = 'pending')`;
