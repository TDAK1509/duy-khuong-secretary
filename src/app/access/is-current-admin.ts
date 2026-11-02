import type { Transaction } from '../db/transaction.ts';

export async function isCurrentAdmin(transaction: Transaction, membershipId: string): Promise<boolean> {
  const rows = await transaction.query(`SELECT 1 FROM memberships WHERE id = $1 AND role = 'admin' FOR SHARE`, [membershipId]);
  return rows.length > 0;
}
