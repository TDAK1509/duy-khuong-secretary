import type { Database } from '../db/transaction.ts';

export type MessageToReread = {
  id: string;
  workspaceId: string;
  userId: string;
  text: string | null;
  imageKey: string | null;
  sentAt: Date;
  hasRecords: boolean;
  firstRecordAt: Date | null;
};

type MessageRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  text: string | null;
  image_key: string | null;
  sent_at: Date;
  first_record_at: Date | null;
};

export async function loadMessageToReread(scoped: Database, messageId: string): Promise<MessageToReread> {
  const { rows } = await scoped.query<MessageRow>(MESSAGE_TO_REREAD, [messageId]);
  const [row] = rows;
  if (!row) throw new Error(`message ${messageId} is not in the workspace`);
  return toMessageToReread(row);
}

function toMessageToReread(row: MessageRow): MessageToReread {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    text: row.text,
    imageKey: row.image_key,
    sentAt: row.sent_at,
    hasRecords: row.first_record_at !== null,
    firstRecordAt: row.first_record_at,
  };
}

const MESSAGE_TO_REREAD = `
  SELECT message.id, message.workspace_id, message.user_id, message.text, message.image_key,
    COALESCE((event.payload ->> 'sent_at')::timestamptz, message.created_at) AS sent_at,
    (SELECT min(record.created_at) FROM records record WHERE record.message_id = message.id) AS first_record_at
  FROM messages message LEFT JOIN inbound_events event ON event.id = message.inbound_event_id
  WHERE message.id = $1`;
