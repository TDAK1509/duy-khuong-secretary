import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { ToolRefusal } from '../admin-chat/tools/tool-result.ts';
import { exceedsMemoryLimit, writeFacts } from './memory-facts.ts';

export type MemoryOwner = { workspaceId: string; userId: string };

export async function readPrivateMemory(database: Database, { workspaceId, userId }: MemoryOwner): Promise<string> {
  const { rows } = await database.query<{ fact: string }>(
    'SELECT fact FROM private_memories WHERE workspace_id = $1 AND author_user_id = $2 ORDER BY created_at, id',
    [workspaceId, userId],
  );
  return writeFacts(rows.map((row) => row.fact));
}

export async function addPrivateFact(database: Database, owner: MemoryOwner, fact: string, fullError: string): Promise<string | null> {
  return editPrivateMemory(database, owner, async (transaction, facts) => {
    if (facts.includes(fact)) return facts;
    const extended = [...facts, fact];
    if (exceedsMemoryLimit(extended)) throw new ToolRefusal(fullError);
    await transaction.query('INSERT INTO private_memories (workspace_id, author_user_id, fact) VALUES ($1, $2, $3)', [owner.workspaceId, owner.userId, fact]);
    return extended;
  });
}

export async function removePrivateFact(database: Database, owner: MemoryOwner, fact: string, notFoundError: string): Promise<string | null> {
  return editPrivateMemory(database, owner, async (transaction, facts) => {
    if (!facts.includes(fact)) throw new ToolRefusal(notFoundError);
    await transaction.query('DELETE FROM private_memories WHERE workspace_id = $1 AND author_user_id = $2 AND fact = $3', [owner.workspaceId, owner.userId, fact]);
    return facts.filter((saved) => saved !== fact);
  });
}

export async function clearPrivateMemory(database: Database, owner: MemoryOwner): Promise<string | null> {
  return editPrivateMemory(database, owner, async (transaction) => {
    await transaction.query('DELETE FROM private_memories WHERE workspace_id = $1 AND author_user_id = $2', [owner.workspaceId, owner.userId]);
    return [];
  });
}

async function editPrivateMemory(
  database: Database,
  owner: MemoryOwner,
  edit: (transaction: Transaction, facts: string[]) => Promise<string[]>,
): Promise<string | null> {
  return runInTransaction(database, async (transaction) => {
    await lockPrivateMemory(transaction, owner);
    if (!(await isMemberOf(transaction, owner))) return null;
    return writeFacts(await edit(transaction, await selectFacts(transaction, owner)));
  });
}

async function lockPrivateMemory(transaction: Transaction, { workspaceId, userId }: MemoryOwner): Promise<void> {
  await transaction.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`private_memories:${workspaceId}:${userId}`]);
}

async function isMemberOf(transaction: Transaction, { workspaceId, userId }: MemoryOwner): Promise<boolean> {
  const rows = await transaction.query('SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 FOR SHARE', [workspaceId, userId]);
  return rows.length > 0;
}

async function selectFacts(transaction: Transaction, { workspaceId, userId }: MemoryOwner): Promise<string[]> {
  const rows = await transaction.query<{ fact: string }>(
    'SELECT fact FROM private_memories WHERE workspace_id = $1 AND author_user_id = $2 ORDER BY created_at, id',
    [workspaceId, userId],
  );
  return rows.map((row) => row.fact);
}
