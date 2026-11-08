import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';

const COUNT_NOT_REREAD = `SELECT count(*)::int AS count FROM messages message
  WHERE message.workspace_id = $1
    AND EXISTS (SELECT 1 FROM records record WHERE record.message_id = message.id)
    AND NOT EXISTS (SELECT 1 FROM document_sources source WHERE source.message_id = message.id)
    AND NOT EXISTS (SELECT 1 FROM document_reads document_read WHERE document_read.message_id = message.id)`;

export async function countNotRereadMessages(database: Database, scope: AccessScope): Promise<number> {
  const { rows } = await database.query<{ count: number }>(COUNT_NOT_REREAD, [scope.workspaceId]);
  return rows[0]?.count ?? 0;
}
