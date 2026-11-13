import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export async function insertPrivateMemory(database: TemporaryDatabase, memory: { workspaceId: string; userId: string; markdown: string }): Promise<void> {
  for (const line of memory.markdown.split('\n')) {
    await database.query(
      `INSERT INTO private_memories (workspace_id, author_user_id, fact)
       VALUES (${literal(memory.workspaceId)}, ${literal(memory.userId)}, ${literal(line.slice(2))})`,
    );
  }
}

export async function readPrivateMemory(database: TemporaryDatabase, userId: string): Promise<string | null> {
  const rows = await database.query<{ fact: string }>(`SELECT fact FROM private_memories WHERE author_user_id = ${literal(userId)} ORDER BY created_at, id`);
  return rows.length === 0 ? null : rows.map((row) => `- ${row.fact}`).join('\n');
}
