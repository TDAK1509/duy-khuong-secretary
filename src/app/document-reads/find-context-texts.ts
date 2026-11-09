import type { Database } from '../db/transaction.ts';
import type { MessageToReread } from './load-message-to-reread.ts';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_CONTEXT_TEXTS = 10;

export async function findContextTexts(scoped: Database, message: MessageToReread): Promise<string[]> {
  const from = new Date(message.sentAt.getTime() - WINDOW_MS);
  const until = message.firstRecordAt ?? new Date(message.sentAt.getTime() + WINDOW_MS);
  const { rows } = await scoped.query<{ text: string }>(CONTEXT_TEXTS, [message.workspaceId, message.userId, message.id, from, until, MAX_CONTEXT_TEXTS]);
  return rows.map((row) => row.text);
}

const CONTEXT_TEXTS = `
  SELECT text FROM (
    SELECT message.text, (event.payload ->> 'sent_at')::timestamptz AS sent_at, message.created_at, message.id
    FROM messages message JOIN inbound_events event ON event.id = message.inbound_event_id
    WHERE message.workspace_id = $1 AND message.user_id = $2 AND message.id <> $3
      AND message.author = 'user' AND message.source = 'zalo' AND event.kind = 'text' AND message.text IS NOT NULL
      AND (event.payload ->> 'sent_at')::timestamptz BETWEEN $4 AND $5
    ORDER BY sent_at DESC, message.created_at DESC, message.id DESC
    LIMIT $6
  ) latest
  ORDER BY sent_at, created_at, id`;
