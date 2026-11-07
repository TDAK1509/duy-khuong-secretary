import type { StoredDetail } from '../reading/detail-numbers-request.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import type { Database } from '../db/transaction.ts';

export type RecordWithoutNumbers = { id: string; details: StoredDetail[] };

const BATCH_SIZE = 50;

const HAS_DETAIL_WITHOUT_NUMBER_KEY = `workspace_id = $1 AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(details) AS detail WHERE NOT (detail ? 'number')
)`;

export async function countRecordsWithoutNumbers(database: Database, workspaceId: string): Promise<number> {
  const { rows } = await scopeDatabase(database, { workspaceId }).query<{ total: number }>(
    `SELECT count(*)::int AS total FROM records WHERE ${HAS_DETAIL_WITHOUT_NUMBER_KEY}`,
    [workspaceId],
  );
  return rows[0]?.total ?? 0;
}

export async function findRecordsWithoutNumbers(database: Database, workspaceId: string): Promise<RecordWithoutNumbers[]> {
  const { rows } = await scopeDatabase(database, { workspaceId }).query<RecordWithoutNumbers>(
    `SELECT id, details FROM records WHERE ${HAS_DETAIL_WITHOUT_NUMBER_KEY} ORDER BY id LIMIT ${BATCH_SIZE}`,
    [workspaceId],
  );
  return rows;
}
