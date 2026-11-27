import type { Database } from '../db/transaction.ts';
import { isQuestionPending } from '../intake/store-user-message.ts';
import type { CurrentRequest } from './build-chat-context.ts';
import type { ChatMessage } from './chat-message.ts';
import { describeQuotedPhoto } from './describe-quoted-photo.ts';

export async function buildCurrentRequest(database: Database, message: ChatMessage, workspaceId: string): Promise<CurrentRequest> {
  const savedNote = (await isQuestionPending(database, message.id)) ? await findSavedReply(database, message.id) : null;
  const quotedPhoto = await describeQuotedPhoto(database, { workspaceId, currentMessageId: message.id });
  return { text: message.text === '' ? null : message.text, savedNote, quotedPhoto };
}

async function findSavedReply(database: Database, messageId: string): Promise<string | null> {
  const { rows } = await database.query<{ text: string }>(
    `SELECT text FROM messages WHERE reply_to = $1 AND reply_kind = 'saved'`,
    [messageId],
  );
  return rows[0]?.text ?? null;
}
