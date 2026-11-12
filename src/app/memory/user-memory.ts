import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';

export type MemoryOwner = { workspaceId: string; userId: string };

export async function updateUserMemory(database: Database, owner: MemoryOwner, change: (markdown: string) => string): Promise<string | null> {
  return runInTransaction(database, async (transaction) => {
    if (!(await isMemberOf(transaction, owner))) return null;
    const updated = change(await selectMarkdown(transaction, owner));
    await storeMarkdown(transaction, owner, updated);
    return updated;
  });
}

async function isMemberOf(transaction: Transaction, { workspaceId, userId }: MemoryOwner): Promise<boolean> {
  const rows = await transaction.query('SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 FOR SHARE', [workspaceId, userId]);
  return rows.length > 0;
}

async function selectMarkdown(transaction: Transaction, { workspaceId, userId }: MemoryOwner): Promise<string> {
  const [row] = await transaction.query<{ markdown: string }>('SELECT markdown FROM user_memories WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
  return row?.markdown ?? '';
}

async function storeMarkdown(transaction: Transaction, { workspaceId, userId }: MemoryOwner, markdown: string): Promise<void> {
  await transaction.query(
    `INSERT INTO user_memories (workspace_id, user_id, markdown) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET markdown = EXCLUDED.markdown, updated_at = now()`,
    [workspaceId, userId, markdown],
  );
}
