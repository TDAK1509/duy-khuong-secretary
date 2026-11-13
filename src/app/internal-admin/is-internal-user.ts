import type { Transaction } from '../db/transaction.ts';

export async function isInternalUser(transaction: Transaction, userId: string): Promise<boolean> {
  const [user] = await transaction.query<{ is_internal: boolean }>('SELECT is_internal FROM users WHERE id = $1', [userId]);
  return user?.is_internal === true;
}
