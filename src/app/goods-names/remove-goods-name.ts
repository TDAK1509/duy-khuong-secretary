import type { Database } from '../db/transaction.ts';

export type RemovedGoodsName = { writtenName: string; shownName: string };

const REMOVE_GOODS_NAME_SQL = 'DELETE FROM goods_names WHERE workspace_id = $1 AND match_key = $2 RETURNING written_name, shown_name';

export async function removeGoodsName(database: Database, workspaceId: string, matchKey: string): Promise<RemovedGoodsName | null> {
  const { rows } = await database.query<{ written_name: string; shown_name: string }>(REMOVE_GOODS_NAME_SQL, [workspaceId, matchKey]);
  const [row] = rows;
  return row === undefined ? null : { writtenName: row.written_name, shownName: row.shown_name };
}
