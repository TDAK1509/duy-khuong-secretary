import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';

export type GoodsNameToJoin = { writtenName: string; matchKey: string };

export type NewGoodsNames = { workspaceId: string; authorUserId: string; names: GoodsNameToJoin[]; shownName: string };

export type JoinedGoodsName = { writtenName: string; replacedShownName: string | null };

const FIND_SHOWN_NAME_SQL = 'SELECT shown_name FROM goods_names WHERE workspace_id = $1 AND match_key = $2 FOR UPDATE';

const UPSERT_GOODS_NAME_SQL = `
  INSERT INTO goods_names (workspace_id, author_user_id, written_name, match_key, shown_name)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (workspace_id, match_key) DO UPDATE SET shown_name = EXCLUDED.shown_name, author_user_id = EXCLUDED.author_user_id
`;

export function joinGoodsNames(database: Database, newNames: NewGoodsNames): Promise<JoinedGoodsName[]> {
  return runInTransaction(database, async (transaction) => {
    const joined: JoinedGoodsName[] = [];
    for (const name of newNames.names) joined.push(await joinGoodsName(transaction, newNames, name));
    return joined;
  });
}

async function joinGoodsName(transaction: Transaction, { workspaceId, authorUserId, shownName }: NewGoodsNames, { writtenName, matchKey }: GoodsNameToJoin): Promise<JoinedGoodsName> {
  const [previous] = await transaction.query<{ shown_name: string }>(FIND_SHOWN_NAME_SQL, [workspaceId, matchKey]);
  await transaction.query(UPSERT_GOODS_NAME_SQL, [workspaceId, authorUserId, writtenName, matchKey, shownName]);
  return { writtenName, replacedShownName: previous?.shown_name ?? null };
}
