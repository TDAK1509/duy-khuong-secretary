import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export async function insertMemberMemory(database: TemporaryDatabase, memory: { workspaceId: string; userId: string; markdown: string }): Promise<void> {
  await database.query(
    `INSERT INTO member_memories (workspace_id, user_id, markdown)
     VALUES (${literal(memory.workspaceId)}, ${literal(memory.userId)}, ${literal(memory.markdown)})`,
  );
}
