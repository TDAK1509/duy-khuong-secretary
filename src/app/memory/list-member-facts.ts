import type { Transaction } from '../db/transaction.ts';
import { listFacts } from './memory-facts.ts';

export async function listMemberFacts(transaction: Transaction, workspaceId: string, userId: string): Promise<string[]> {
  return transaction.withScope({ workspaceId }, async () => {
    const [row] = await transaction.query<{ markdown: string }>(
      'SELECT markdown FROM member_memories WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId],
    );
    return listFacts(row?.markdown ?? '');
  });
}
