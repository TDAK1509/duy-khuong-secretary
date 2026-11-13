import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';

export type MemberRef = { workspaceId: string; membershipId: string };

export type MemberMemory = { displayName: string; markdown: string };

type Member = { userId: string; displayName: string };

export async function readMemberMemory(database: Database, { workspaceId, membershipId }: MemberRef): Promise<MemberMemory | null> {
  const { rows } = await database.query<{ display_name: string; markdown: string | null }>(
    `SELECT memberships.display_name, member_memories.markdown
     FROM memberships
     LEFT JOIN member_memories ON member_memories.workspace_id = memberships.workspace_id AND member_memories.user_id = memberships.user_id
     WHERE memberships.id = $1 AND memberships.workspace_id = $2`,
    [membershipId, workspaceId],
  );
  const [row] = rows;
  return row ? { displayName: row.display_name, markdown: row.markdown ?? '' } : null;
}

export async function updateMemberMemory(database: Database, ref: MemberRef, change: (markdown: string) => string): Promise<MemberMemory | null> {
  return runInTransaction(database, async (transaction) => {
    const member = await findMember(transaction, ref);
    if (member === null) return null;
    await lockMemberMemory(transaction, ref.workspaceId, member.userId);
    if (!(await holdMembership(transaction, ref))) return null;
    const current = await selectMarkdown(transaction, ref.workspaceId, member.userId);
    const updated = change(current);
    if (updated !== current) await replaceMarkdown(transaction, ref.workspaceId, member.userId, updated);
    return { displayName: member.displayName, markdown: updated };
  });
}

async function findMember(transaction: Transaction, { workspaceId, membershipId }: MemberRef): Promise<Member | null> {
  const [row] = await transaction.query<{ user_id: string; display_name: string }>(
    'SELECT user_id, display_name FROM memberships WHERE id = $1 AND workspace_id = $2',
    [membershipId, workspaceId],
  );
  return row ? { userId: row.user_id, displayName: row.display_name } : null;
}

async function lockMemberMemory(transaction: Transaction, workspaceId: string, userId: string): Promise<void> {
  await transaction.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`member_memories:${workspaceId}:${userId}`]);
}

async function holdMembership(transaction: Transaction, { workspaceId, membershipId }: MemberRef): Promise<boolean> {
  const rows = await transaction.query('SELECT 1 FROM memberships WHERE id = $1 AND workspace_id = $2 FOR SHARE', [membershipId, workspaceId]);
  return rows.length > 0;
}

async function selectMarkdown(transaction: Transaction, workspaceId: string, userId: string): Promise<string> {
  const [row] = await transaction.query<{ markdown: string }>('SELECT markdown FROM member_memories WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
  return row?.markdown ?? '';
}

async function replaceMarkdown(transaction: Transaction, workspaceId: string, userId: string, markdown: string): Promise<void> {
  if (markdown === '') await deleteMarkdown(transaction, workspaceId, userId);
  else await storeMarkdown(transaction, workspaceId, userId, markdown);
}

async function deleteMarkdown(transaction: Transaction, workspaceId: string, userId: string): Promise<void> {
  await transaction.query('DELETE FROM member_memories WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
}

async function storeMarkdown(transaction: Transaction, workspaceId: string, userId: string, markdown: string): Promise<void> {
  await transaction.query(
    `INSERT INTO member_memories (workspace_id, user_id, markdown) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET markdown = EXCLUDED.markdown, updated_at = now()`,
    [workspaceId, userId, markdown],
  );
}
