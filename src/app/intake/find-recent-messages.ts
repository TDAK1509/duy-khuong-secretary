import type { Database } from '../db/transaction.ts';
import type { IntakeSender } from './find-intake-sender.ts';

const RECENT_WINDOW_MS = 10 * 60 * 1000;

export type RecentPhoto = { id: string; imageKey: string };

export type RecentMessages = { texts: string[]; photo: RecentPhoto | null };

export type CurrentMessage = { id: string; sentAt: Date };

type RecentRow = { id: string; text: string | null; image_key: string | null; kind: 'text' | 'images' };

export async function findRecentMessages(database: Database, sender: IntakeSender, current: CurrentMessage): Promise<RecentMessages> {
  const { rows } = await database.query<RecentRow>(
    `SELECT message.id, message.text, message.image_key, event.kind
     FROM messages message
     JOIN inbound_events event ON event.id = message.inbound_event_id
     WHERE message.workspace_id = $1 AND message.user_id = $2 AND message.author = 'user'
       AND (message.created_at, message.id) < (SELECT created_at, id FROM messages WHERE id = $3)
       AND (event.payload ->> 'sent_at')::timestamptz >= $4
     ORDER BY message.created_at, message.id`,
    [sender.workspaceId, sender.userId, current.id, new Date(current.sentAt.getTime() - RECENT_WINDOW_MS)],
  );
  return { texts: rows.flatMap(pickText), photo: rows.reduce<RecentPhoto | null>(pickLatestPhoto, null) };
}

function pickText({ kind, text }: RecentRow): string[] {
  return kind === 'text' && text !== null ? [text] : [];
}

function pickLatestPhoto(latest: RecentPhoto | null, { id, kind, image_key }: RecentRow): RecentPhoto | null {
  return kind === 'images' && image_key !== null ? { id, imageKey: image_key } : latest;
}
