import type { Database } from '../db/transaction.ts';

export async function findConnectedAccountId(database: Database, channel: string): Promise<string> {
  const { rows } = await database.query<{ account_id: string }>(
    'SELECT account_id FROM channel_connections WHERE channel = $1 ORDER BY created_at, id LIMIT 1',
    [channel],
  );
  const [connection] = rows;
  if (!connection) throw new Error(`no connected ${channel} account`);
  return connection.account_id;
}
