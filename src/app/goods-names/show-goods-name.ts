import { buildMatchKey } from '../documents/build-match-key.ts';
import type { Database } from '../db/transaction.ts';

export type ShownGoodsNames = Map<string, string>;

export async function loadShownGoodsNames(database: Database, workspaceId: string): Promise<ShownGoodsNames> {
  const { rows } = await database.query<{ match_key: string; shown_name: string }>('SELECT match_key, shown_name FROM goods_names WHERE workspace_id = $1', [workspaceId]);
  return new Map(rows.map((row) => [row.match_key, row.shown_name]));
}

export function showGoodsName(shownNames: ShownGoodsNames, goods: string | null): string | null {
  if (goods === null) return null;
  return shownNames.get(buildMatchKey(goods)) ?? goods;
}
