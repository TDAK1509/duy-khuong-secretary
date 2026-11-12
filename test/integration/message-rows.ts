import { insertInboundEvent, type NewInboundEvent } from './inbound-event-rows.ts';
import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type NewChatMessage = {
  workspaceId: string;
  userId: string;
  author: 'user' | 'bot';
  text: string | null;
  imageKey?: string | null;
  holdsOtherText?: boolean;
  event?: NewInboundEvent;
  createdAt: Date;
};

export async function insertChatMessage(database: TemporaryDatabase, message: NewChatMessage): Promise<string> {
  const eventId = message.author === 'user' ? await insertInboundEvent(database, { ...message.event, status: 'done' }) : null;
  const holdsOtherTextColumn = message.holdsOtherText === undefined ? '' : ', holds_other_text';
  const holdsOtherTextValue = message.holdsOtherText === undefined ? '' : `, ${message.holdsOtherText}`;
  const [row] = await database.query<{ id: string }>(
    `INSERT INTO messages (workspace_id, user_id, author, text, image_key, inbound_event_id, event_part, created_at${holdsOtherTextColumn})
     VALUES (${literal(message.workspaceId)}, ${literal(message.userId)}, ${literal(message.author)},
       ${message.text === null ? 'NULL' : literal(message.text)}, ${message.imageKey ? literal(message.imageKey) : 'NULL'},
       ${eventId === null ? 'NULL' : literal(eventId)}, ${eventId === null ? 'NULL' : '0'}, ${timestamp(message.createdAt)}${holdsOtherTextValue})
     RETURNING id`,
  );
  if (!row) throw new Error('message not inserted');
  return row.id;
}
