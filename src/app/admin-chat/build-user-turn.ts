import type { ChatTurn } from '../../services/chat/chat-service.ts';
import type { Database } from '../db/transaction.ts';
import type { MessageToRead } from '../intake/reply-to-message.ts';
import { isQuestionPending } from '../intake/store-user-message.ts';
import { formatSavedLine } from '../records/format-saved-reply.ts';

type SavedRecordRow = { summary: string; amount_vnd: number | null; occurred_on: string | null };

export async function buildUserTurn(database: Database, message: MessageToRead): Promise<ChatTurn> {
  const note = (await isQuestionPending(database, message.id)) ? await buildSystemNote(database, message.id) : null;
  const text = [message.text, note].filter((part) => part !== null).join('\n\n');
  return { role: 'user', text: text === '' ? null : text, image: message.photo };
}

async function buildSystemNote(database: Database, messageId: string): Promise<string | null> {
  const { rows } = await database.query<SavedRecordRow>(
    `SELECT summary, amount_vnd::float8 AS amount_vnd, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on
     FROM records WHERE message_id = $1 ORDER BY item_index`,
    [messageId],
  );
  if (rows.length === 0) return null;
  const lines = rows.map((row) => formatSavedLine({ summary: row.summary, amountVnd: row.amount_vnd, occurredOn: row.occurred_on }));
  return ['Hệ thống đã lưu:', ...lines].join('\n');
}
