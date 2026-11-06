import type { Database } from '../db/transaction.ts';

export async function hasNoteFromPhoto(database: Database, messageId: string): Promise<boolean> {
  const { rows } = await database.query(
    `SELECT 1 FROM messages reply
     WHERE reply.reply_to = $1 AND reply.reply_kind = 'saved'
       AND NOT EXISTS (SELECT 1 FROM records WHERE records.message_id = $1)`,
    [messageId],
  );
  return rows.length > 0;
}
