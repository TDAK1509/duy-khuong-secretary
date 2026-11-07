import type { StoredDetail } from '../reading/detail-numbers-request.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import type { Database } from '../db/transaction.ts';

export type RecordWithoutNumbers = { id: string; details: StoredDetail[] };

export const FIRST_RECORD_ID = '00000000-0000-0000-0000-000000000000';

const BATCH_SIZE = 50;

const HAS_DETAIL_WITHOUT_NUMBER = `workspace_id = $1 AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(details) AS detail WHERE detail->>'number' IS NULL
)`;

export async function countRecordsWithoutNumbers(database: Database, workspaceId: string): Promise<number> {
  const { rows } = await scopeDatabase(database, { workspaceId }).query<{ total: number }>(
    `SELECT count(*)::int AS total FROM records WHERE ${HAS_DETAIL_WITHOUT_NUMBER}`,
    [workspaceId],
  );
  return rows[0]?.total ?? 0;
}

export async function findRecordsWithoutNumbers(
  database: Database,
  workspaceId: string,
  afterId: string,
): Promise<RecordWithoutNumbers[]> {
  const { rows } = await scopeDatabase(database, { workspaceId }).query<RecordWithoutNumbers>(
    `SELECT id, details FROM records WHERE ${HAS_DETAIL_WITHOUT_NUMBER} AND id > $2 ORDER BY id LIMIT ${BATCH_SIZE}`,
    [workspaceId, afterId],
  );
  return rows;
}
