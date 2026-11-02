import type { Transaction } from '../db/transaction.ts';

export async function hasConnection(transaction: Transaction, channel: string, accountId: string): Promise<boolean> {
  const rows = await transaction.query('SELECT 1 FROM channel_connections WHERE channel = $1 AND account_id = $2', [
    channel,
    accountId,
  ]);
  return rows.length !== 0;
}
