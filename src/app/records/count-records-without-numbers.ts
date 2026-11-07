import { scopeDatabase } from '../db/scoped-database.ts';
import type { Database } from '../db/transaction.ts';

export async function countRecordsWithoutNumbers(database: Database, workspaceId: string): Promise<number> {
  const scoped = scopeDatabase(database, { workspaceId });
  const { rows } = await scoped.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM records WHERE ${HAS_DETAIL_WITHOUT_NUMBER_KEY}`,
    [workspaceId],
  );
  return rows[0]?.total ?? 0;
}

const HAS_DETAIL_WITHOUT_NUMBER_KEY = `workspace_id = $1 AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(details) AS detail WHERE NOT (detail ? 'number')
)`;
