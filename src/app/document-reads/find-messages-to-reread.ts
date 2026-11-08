import type { Database } from '../db/transaction.ts';

export async function findMessagesToReread(scoped: Database, workspaceId: string, testPhotoIds: string[]): Promise<string[]> {
  const { rows } = await scoped.query<{ id: string }>(MESSAGES_TO_REREAD, [workspaceId, testPhotoIds]);
  return rows.map((row) => row.id);
}

const MESSAGES_TO_REREAD = `
  SELECT message.id FROM messages message LEFT JOIN inbound_events event ON event.id = message.inbound_event_id
  WHERE message.workspace_id = $1 AND message.author = 'user' AND message.id <> ALL($2::uuid[])
    AND (message.image_key IS NOT NULL OR EXISTS (SELECT 1 FROM records record WHERE record.message_id = message.id))
    AND (event.status IS NULL OR event.status NOT IN ('queued', 'processing'))
    AND message.submission_status NOT IN ('needs_explanation', 'asked_again')
    AND NOT EXISTS (SELECT 1 FROM document_sources source WHERE source.message_id = message.id)
    AND NOT EXISTS (SELECT 1 FROM document_reads read WHERE read.message_id = message.id)
  ORDER BY message.created_at, message.id`;
