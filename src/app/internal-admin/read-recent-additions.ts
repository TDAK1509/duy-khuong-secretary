import type { Database } from '../db/transaction.ts';
import { ADDER_SQL } from './addition-adder-sql.ts';

export type RecentAddition = { time: string; workspaceName: string; credits: string; adder: string | null; note: string };

type RecentAdditionRow = { time: string; name: string; credits: string; adder: string | null; note: string };

const RECENT_ADDITION_COUNT = 20;
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export async function readRecentAdditions(database: Database): Promise<RecentAddition[]> {
  const { rows } = await database.query<RecentAdditionRow>(
    `SELECT to_char(addition.created_at AT TIME ZONE '${VIETNAM_TIME_ZONE}', 'DD/MM/YYYY HH24:MI') AS time,
       workspace.name, addition.credits, addition.note, ${ADDER_SQL} AS adder
     FROM credit_additions addition
     JOIN workspaces workspace ON workspace.id = addition.workspace_id
     ORDER BY addition.created_at DESC, addition.id DESC
     LIMIT ${RECENT_ADDITION_COUNT}`,
  );
  return rows.map((row) => ({ time: row.time, workspaceName: row.name, credits: row.credits, adder: row.adder, note: row.note }));
}
