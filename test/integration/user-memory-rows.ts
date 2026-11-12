import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export async function insertUserMemory(database: TemporaryDatabase, memory: { workspaceId: string; userId: string; markdown: string }): Promise<void> {
  await database.query(
    `INSERT INTO user_memories (workspace_id, user_id, markdown)
     VALUES (${literal(memory.workspaceId)}, ${literal(memory.userId)}, ${literal(memory.markdown)})`,
  );
}

export async function readUserMemory(database: TemporaryDatabase, userId: string): Promise<string | null> {
  const [row] = await database.query<{ markdown: string }>(`SELECT markdown FROM user_memories WHERE user_id = ${literal(userId)}`);
  return row?.markdown ?? null;
}
