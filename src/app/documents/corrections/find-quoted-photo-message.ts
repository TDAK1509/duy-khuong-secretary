import type { Transaction } from '../../db/transaction.ts';

export type QuotingMessage = { workspaceId: string; currentMessageId: string };

type PhotoRow = { id: string };

const FIND_ADMIN_PHOTO_SQL = `
  SELECT photo.id
  FROM messages current
  JOIN inbound_events current_event ON current_event.id = current.inbound_event_id
  JOIN inbound_events quoted_event
    ON quoted_event.channel = current_event.channel AND quoted_event.account_id = current_event.account_id
    AND quoted_event.external_user_id = current_event.external_user_id
    AND quoted_event.external_event_id = current_event.payload->>'quote_msg_id'
  JOIN messages photo ON photo.inbound_event_id = quoted_event.id AND photo.workspace_id = $1 AND photo.image_key IS NOT NULL
  WHERE current.id = $2 AND current.workspace_id = $1
  LIMIT 2`;

const FIND_SENT_PHOTO_SQL = `
  SELECT photo.id
  FROM messages current
  JOIN inbound_events current_event ON current_event.id = current.inbound_event_id
  JOIN outbound_messages sent
    ON sent.channel = current_event.channel AND sent.account_id = current_event.account_id
    AND sent.external_user_id = current_event.external_user_id
    AND sent.external_message_id = current_event.payload->>'quote_msg_id'
    AND sent.kind = 'image' AND sent.status = 'sent'
  JOIN messages photo ON photo.image_key = sent.photo_key AND photo.workspace_id = $1
  WHERE current.id = $2 AND current.workspace_id = $1
  LIMIT 2`;

export async function findQuotedPhotoMessage(transaction: Transaction, { workspaceId, currentMessageId }: QuotingMessage): Promise<string | null> {
  const parameters = [workspaceId, currentMessageId];
  const adminPhotos = await transaction.query<PhotoRow>(FIND_ADMIN_PHOTO_SQL, parameters);
  if (adminPhotos.length > 0) return pickOnlyMessage(adminPhotos);
  return pickOnlyMessage(await transaction.query<PhotoRow>(FIND_SENT_PHOTO_SQL, parameters));
}

function pickOnlyMessage(rows: PhotoRow[]): string | null {
  const [row] = rows;
  return rows.length === 1 && row !== undefined ? row.id : null;
}
