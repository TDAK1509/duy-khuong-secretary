import type { Transaction } from '../db/transaction.ts';

export async function storeMcpMessage(transaction: Transaction, { workspaceId, userId }: { workspaceId: string; userId: string }, text: string): Promise<string> {
  const [row] = await transaction.query<{ id: string }>(
    `INSERT INTO messages (workspace_id, user_id, author, text, source, submission_status)
     VALUES ($1, $2, 'user', $3, 'mcp', 'accepted') RETURNING id`,
    [workspaceId, userId, text],
  );
  if (!row) throw new Error('the message of the ChatGPT text was not stored');
  return row.id;
}
