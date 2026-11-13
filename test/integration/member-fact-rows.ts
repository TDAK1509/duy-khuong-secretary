import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type NewMemberFact = {
  workspaceId: string;
  memberUserId: string;
  authorUserId: string | null;
  readers: 'author' | 'admins' | 'admins_and_member';
  fact: string;
};

export async function insertMemberFact(database: TemporaryDatabase, fact: NewMemberFact): Promise<void> {
  await database.query(
    `INSERT INTO member_facts (workspace_id, member_user_id, author_user_id, readers, fact)
     VALUES (${literal(fact.workspaceId)}, ${literal(fact.memberUserId)}, ${fact.authorUserId === null ? 'NULL' : literal(fact.authorUserId)},
       ${literal(fact.readers)}, ${literal(fact.fact)})`,
  );
}

export async function insertSharedMemberFacts(database: TemporaryDatabase, memory: { workspaceId: string; userId: string; markdown: string }): Promise<void> {
  for (const line of memory.markdown.split('\n')) {
    await insertMemberFact(database, {
      workspaceId: memory.workspaceId,
      memberUserId: memory.userId,
      authorUserId: null,
      readers: 'admins_and_member',
      fact: line.slice(2),
    });
  }
}

export async function readMemberFacts(database: TemporaryDatabase, memberUserId: string): Promise<string | null> {
  const rows = await database.query<{ fact: string }>(`SELECT fact FROM member_facts WHERE member_user_id = ${literal(memberUserId)} ORDER BY created_at, id`);
  return rows.length === 0 ? null : rows.map((row) => `- ${row.fact}`).join('\n');
}
