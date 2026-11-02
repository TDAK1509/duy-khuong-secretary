import type { Database } from '../db/transaction.ts';

export async function hasConnection(database: Database, channel: string, accountId: string): Promise<boolean> {
  const result = await database.query(
    'SELECT 1 FROM channel_connections WHERE channel = $1 AND account_id = $2',
    [channel, accountId],
  );
  return result.rowCount !== 0;
}
