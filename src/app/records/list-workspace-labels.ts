import type { Transaction } from '../db/transaction.ts';

const MAX_LABEL_COUNT = 30;
const MAX_LABEL_LENGTH = 60;

export async function listWorkspaceLabels(transaction: Transaction, workspaceId: string): Promise<string[]> {
  return transaction.withScope({ workspaceId }, async () => {
    const rows = await transaction.query<{ label: string }>(LABELS_QUERY, [workspaceId, MAX_LABEL_LENGTH, MAX_LABEL_COUNT]);
    return rows.map((row) => row.label);
  });
}

const LABELS_QUERY = `
  SELECT label
  FROM (
    SELECT record.id, trim(detail->>'label') AS label
    FROM records record, jsonb_array_elements(record.details) detail
    WHERE record.workspace_id = $1
  ) used
  WHERE label <> '' AND char_length(label) <= $2
  GROUP BY label
  ORDER BY count(DISTINCT id) DESC, label COLLATE "C" ASC
  LIMIT $3`;
