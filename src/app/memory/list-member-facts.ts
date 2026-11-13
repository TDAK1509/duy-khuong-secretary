import type { Transaction } from '../db/transaction.ts';
import { mayFeedReader, type FactReader, type FactReaders } from './fact-readers.ts';

type FactRow = { member_user_id: string; author_user_id: string | null; readers: FactReaders; fact: string };

export async function listMemberFacts(transaction: Transaction, workspaceId: string, sender: FactReader): Promise<string[]> {
  return transaction.withScope({ workspaceId }, async () => {
    const rows = await transaction.query<FactRow>(
      'SELECT member_user_id, author_user_id, readers, fact FROM member_facts WHERE workspace_id = $1 AND member_user_id = $2 ORDER BY created_at, id',
      [workspaceId, sender.userId],
    );
    return rows.filter((row) => mayFeedReader({ readers: row.readers, authorUserId: row.author_user_id, memberUserId: row.member_user_id }, sender)).map((row) => row.fact);
  });
}
