import type { Database } from '../db/transaction.ts';

const COUNT_NOT_REREAD = `SELECT count(*)::int AS count FROM messages message
  WHERE EXISTS (SELECT 1 FROM records record WHERE record.message_id = message.id)
    AND NOT EXISTS (SELECT 1 FROM document_sources source WHERE source.message_id = message.id)
    AND NOT EXISTS (SELECT 1 FROM document_reads document_read WHERE document_read.message_id = message.id)`;

export async function countNotRereadMessages(database: Database): Promise<number> {
  const { rows } = await database.query<{ count: number }>(COUNT_NOT_REREAD);
  return rows[0]?.count ?? 0;
}
