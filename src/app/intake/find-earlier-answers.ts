import type { Database } from '../db/transaction.ts';
import type { IntakeSender } from './find-intake-sender.ts';

const EARLIER_ANSWER_WINDOW_MS = 10 * 60 * 1000;

export type AnswerToRead = { photoId: string; currentTextId: string; currentSentAt: Date };

export async function findEarlierAnswers(database: Database, sender: IntakeSender, answer: AnswerToRead): Promise<string[]> {
  const { rows } = await database.query<{ text: string }>(
    `SELECT earlier.text
     FROM messages earlier
     JOIN inbound_events event ON event.id = earlier.inbound_event_id
     JOIN messages question ON question.reply_to = $3 AND question.author = 'bot'
     WHERE earlier.workspace_id = $1 AND earlier.user_id = $2 AND earlier.author = 'user'
       AND event.kind = 'text' AND earlier.id <> $4
       AND (earlier.created_at, earlier.id) > (question.created_at, question.id)
       AND (event.payload ->> 'sent_at')::timestamptz >= $5
     ORDER BY earlier.created_at, earlier.id`,
    [sender.workspaceId, sender.userId, answer.photoId, answer.currentTextId, new Date(answer.currentSentAt.getTime() - EARLIER_ANSWER_WINDOW_MS)],
  );
  return rows.map(({ text }) => text);
}
