import type { ChatTurn } from '../../services/chat/chat-service.ts';
import type { Database } from '../db/transaction.ts';
import type { MessageToRead } from '../intake/reply-to-message.ts';
import { isQuestionPending } from '../intake/store-user-message.ts';

export async function buildUserTurn(database: Database, message: MessageToRead): Promise<ChatTurn> {
  const note = (await isQuestionPending(database, message.id)) ? await buildSystemNote(database, message.id) : null;
  const text = [message.text, note].filter((part) => part !== null).join('\n\n');
  return { role: 'user', text: text === '' ? null : text, image: message.photo };
}

async function buildSystemNote(database: Database, messageId: string): Promise<string | null> {
  const { rows } = await database.query<{ text: string }>(
    `SELECT text FROM messages WHERE reply_to = $1 AND reply_kind = 'saved'`,
    [messageId],
  );
  const [savedReply] = rows;
  return savedReply ? `Hệ thống đã lưu:\n${savedReply.text}` : null;
}
