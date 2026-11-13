import type { Transaction } from '../db/transaction.ts';

const MAX_LABEL_COUNT = 30;
const MAX_LABEL_LENGTH = 60;
const NEWEST_RECORD_COUNT = 500;

export async function listWorkspaceLabels(transaction: Transaction, workspaceId: string): Promise<string[]> {
  return transaction.withScope({ workspaceId }, async () => {
    const rows = await transaction.query<{ label: string }>(LABELS_QUERY, [workspaceId, MAX_LABEL_LENGTH, MAX_LABEL_COUNT, NEWEST_RECORD_COUNT]);
    return rows.map((row) => row.label);
  });
}

const LABELS_QUERY = `
  SELECT label
  FROM (
    SELECT record.id, trim(detail->>'label') AS label
    FROM (
      SELECT id, details
      FROM records
      WHERE workspace_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $4
    ) record, jsonb_array_elements(record.details) detail
  ) used
  WHERE label <> '' AND char_length(label) <= $2
  GROUP BY label
  ORDER BY count(DISTINCT id) DESC, label COLLATE "C" ASC
  LIMIT $3`;
