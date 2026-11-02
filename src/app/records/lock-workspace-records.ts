import type { Transaction } from '../db/transaction.ts';

export async function lockWorkspaceRecords(transaction: Transaction, workspaceId: string): Promise<void> {
  await transaction.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`records:${workspaceId}`]);
}
