import { insertInboundEvent } from './inbound-event-rows.ts';
import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type NewSentMessage = {
  workspaceId: string;
  userId: string;
  sentAt: string;
  text?: string | null;
  imageKey?: string | null;
  eventStatus?: 'queued' | 'processing' | 'done' | 'failed';
  submissionStatus?: 'pending' | 'accepted' | 'duplicate' | 'unresolved' | 'needs_explanation' | 'asked_again';
  createdAt?: Date;
};

export async function insertSentMessage(database: TemporaryDatabase, message: NewSentMessage): Promise<string> {
  const imageKey = message.imageKey ?? null;
  const eventId = await insertInboundEvent(database, {
    status: message.eventStatus ?? 'done',
    kind: imageKey === null ? 'text' : 'images',
    sentAt: message.sentAt,
  });
  const [row] = await database.query<{ id: string }>(
    `INSERT INTO messages (workspace_id, user_id, author, text, image_key, inbound_event_id, event_part, submission_status, created_at)
     VALUES (${literal(message.workspaceId)}, ${literal(message.userId)}, 'user',
       ${message.text == null ? 'NULL' : literal(message.text)}, ${imageKey === null ? 'NULL' : literal(imageKey)},
       ${literal(eventId)}, 0, ${literal(message.submissionStatus ?? 'accepted')},
       ${timestamp(message.createdAt ?? new Date(message.sentAt))})
     RETURNING id`,
  );
  if (!row) throw new Error('message not inserted');
  return row.id;
}
