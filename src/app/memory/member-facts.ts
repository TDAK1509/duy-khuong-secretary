import { ToolRefusal } from '../admin-chat/tools/tool-result.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { mayRead, type FactAccess, type FactReader, type FactReaders } from './fact-readers.ts';
import { exceedsMemoryLimit } from './memory-facts.ts';

export type MemberRef = { workspaceId: string; membershipId: string };

export type SavedFact = FactAccess & { id: string; fact: string };

export type NewMemberFact = { fact: string; readers: FactReaders };

export type MemberFacts = { displayName: string; facts: SavedFact[] };

type Member = { userId: string; displayName: string };

type FactRow = { id: string; member_user_id: string; author_user_id: string | null; readers: FactReaders; fact: string };

export async function readMemberFacts(database: Database, ref: MemberRef, caller: FactReader): Promise<MemberFacts | null> {
  return changeMemberFacts(database, ref, async (transaction, member) => ({ displayName: member.displayName, facts: await selectReadableFacts(transaction, ref, member, caller) }));
}

export async function addMemberFact(
  database: Database,
  ref: MemberRef,
  author: FactReader,
  { fact, readers }: NewMemberFact,
  fullError: string,
): Promise<(MemberFacts & { saved: SavedFact }) | null> {
  return changeMemberFacts(database, ref, async (transaction, member) => {
    const facts = await selectReadableFacts(transaction, ref, member, author);
    const duplicate = facts.find((saved) => saved.fact === fact);
    if (duplicate) return { displayName: member.displayName, facts, saved: duplicate };
    if (exceedsMemoryLimit([...facts.map((saved) => saved.fact), fact])) throw new ToolRefusal(fullError);
    const saved = await insertFact(transaction, ref, member, author, { fact, readers });
    return { displayName: member.displayName, facts: [...facts, saved], saved };
  });
}

export async function removeMemberFact(database: Database, ref: MemberRef, caller: FactReader, fact: string, notFoundError: string): Promise<MemberFacts | null> {
  return changeMemberFacts(database, ref, async (transaction, member) => {
    const facts = await selectReadableFacts(transaction, ref, member, caller);
    const removed = facts.filter((saved) => saved.fact === fact);
    if (removed.length === 0) throw new ToolRefusal(notFoundError);
    await deleteFacts(transaction, removed);
    return { displayName: member.displayName, facts: facts.filter((saved) => saved.fact !== fact) };
  });
}

export async function clearMemberFacts(database: Database, ref: MemberRef, caller: FactReader): Promise<MemberFacts | null> {
  return changeMemberFacts(database, ref, async (transaction, member) => {
    await deleteFacts(transaction, await selectReadableFacts(transaction, ref, member, caller));
    return { displayName: member.displayName, facts: [] };
  });
}

async function changeMemberFacts<Result>(
  database: Database,
  ref: MemberRef,
  change: (transaction: Transaction, member: Member) => Promise<Result>,
): Promise<Result | null> {
  return runInTransaction(database, async (transaction) => {
    const member = await findMember(transaction, ref);
    if (member === null) return null;
    await lockMemberFacts(transaction, ref.workspaceId, member.userId);
    if (!(await holdMembership(transaction, ref))) return null;
    return change(transaction, member);
  });
}

async function findMember(transaction: Transaction, { workspaceId, membershipId }: MemberRef): Promise<Member | null> {
  const [row] = await transaction.query<{ user_id: string; display_name: string }>(
    'SELECT user_id, display_name FROM memberships WHERE id = $1 AND workspace_id = $2',
    [membershipId, workspaceId],
  );
  return row ? { userId: row.user_id, displayName: row.display_name } : null;
}

async function lockMemberFacts(transaction: Transaction, workspaceId: string, userId: string): Promise<void> {
  await transaction.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`member_facts:${workspaceId}:${userId}`]);
}

async function holdMembership(transaction: Transaction, { workspaceId, membershipId }: MemberRef): Promise<boolean> {
  const rows = await transaction.query('SELECT 1 FROM memberships WHERE id = $1 AND workspace_id = $2 FOR SHARE', [membershipId, workspaceId]);
  return rows.length > 0;
}

async function selectReadableFacts(transaction: Transaction, ref: MemberRef, member: Member, caller: FactReader): Promise<SavedFact[]> {
  const facts = await selectFacts(transaction, ref, member);
  return facts.filter((saved) => mayRead(saved, caller));
}

async function selectFacts(transaction: Transaction, { workspaceId }: MemberRef, member: Member): Promise<SavedFact[]> {
  const rows = await transaction.query<FactRow>(
    'SELECT id, member_user_id, author_user_id, readers, fact FROM member_facts WHERE workspace_id = $1 AND member_user_id = $2 ORDER BY created_at, id',
    [workspaceId, member.userId],
  );
  return rows.map(toSavedFact);
}

function toSavedFact(row: FactRow): SavedFact {
  return { id: row.id, memberUserId: row.member_user_id, authorUserId: row.author_user_id, readers: row.readers, fact: row.fact };
}

async function insertFact(transaction: Transaction, { workspaceId }: MemberRef, member: Member, author: FactReader, { fact, readers }: NewMemberFact): Promise<SavedFact> {
  const [row] = await transaction.query<FactRow>(
    `INSERT INTO member_facts (workspace_id, member_user_id, author_user_id, readers, fact) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, member_user_id, author_user_id, readers, fact`,
    [workspaceId, member.userId, author.userId, readers, fact],
  );
  if (!row) throw new Error('the member fact was not stored');
  return toSavedFact(row);
}

async function deleteFacts(transaction: Transaction, facts: SavedFact[]): Promise<void> {
  await transaction.query('DELETE FROM member_facts WHERE id = ANY($1::uuid[])', [facts.map((saved) => saved.id)]);
}
