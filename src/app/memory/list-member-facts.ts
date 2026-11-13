import type { Transaction } from '../db/transaction.ts';

export async function listMemberFacts(transaction: Transaction, workspaceId: string, userId: string): Promise<string[]> {
  return transaction.withScope({ workspaceId }, async () => {
    const rows = await transaction.query<{ fact: string }>(
      'SELECT fact FROM member_facts WHERE workspace_id = $1 AND member_user_id = $2 ORDER BY created_at, id',
      [workspaceId, userId],
    );
    return rows.map((row) => row.fact);
  });
}
