import type { Transaction } from '../db/transaction.ts';
import type { AccessScope } from './access-scope.ts';

export async function isCurrentMember(transaction: Transaction, membershipId: string, role: AccessScope['role']): Promise<boolean> {
  const rows = await transaction.query(`SELECT 1 FROM memberships WHERE id = $1 AND role = $2 FOR SHARE`, [membershipId, role]);
  return rows.length > 0;
}
