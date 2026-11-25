import type { Database } from '../db/transaction.ts';

export type GoodsName = { id: string; writtenName: string; shownName: string; authorName: string | null };

type GoodsNameRow = { id: string; written_name: string; shown_name: string; author_name: string | null };

const LIST_GOODS_NAMES_SQL = `
  SELECT goods_name.id, goods_name.written_name, goods_name.shown_name, author.display_name AS author_name
  FROM goods_names goods_name
  LEFT JOIN memberships author ON author.workspace_id = goods_name.workspace_id AND author.user_id = goods_name.author_user_id
  WHERE goods_name.workspace_id = $1
  ORDER BY goods_name.created_at, goods_name.id
`;

export async function listGoodsNames(database: Database, workspaceId: string): Promise<GoodsName[]> {
  const { rows } = await database.query<GoodsNameRow>(LIST_GOODS_NAMES_SQL, [workspaceId]);
  return rows.map(({ id, written_name: writtenName, shown_name: shownName, author_name: authorName }) => ({ id, writtenName, shownName, authorName }));
}
