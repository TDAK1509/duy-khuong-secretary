import type { ChatTurn } from '../../services/chat/chat-service.ts';
import type { Database } from '../db/transaction.ts';
import type { IntakeSender } from '../intake/find-intake-sender.ts';

const HISTORY_LIMIT = 20;
const PHOTO_MARK = '[ảnh]';
const CAPTION_MARK = '[ghi chú kèm file, đã dùng để đọc file]';

type HistoryRow = { author: 'user' | 'bot'; text: string | null; image_key: string | null; is_caption: boolean };

export async function loadHistoryTurns(
  database: Database,
  sender: IntakeSender,
  joinedAt: Date,
  currentMessageId: string,
): Promise<ChatTurn[]> {
  const { rows } = await database.query<HistoryRow>(
    `SELECT author, text, image_key,
       EXISTS (SELECT 1 FROM inbound_events event WHERE event.id = messages.inbound_event_id AND event.caption_for_event_id IS NOT NULL) AS is_caption
     FROM messages
     WHERE workspace_id = $1 AND user_id = $2 AND created_at >= $3 AND source <> 'mcp'
       AND id <> $4 AND reply_to IS DISTINCT FROM $4
     ORDER BY created_at DESC, id DESC
     LIMIT $5`,
    [sender.workspaceId, sender.userId, joinedAt, currentMessageId, HISTORY_LIMIT],
  );
  return rows.reverse().map(toTurn);
}

function toTurn(row: HistoryRow): ChatTurn {
  if (row.author === 'bot') return { role: 'assistant', text: row.text ?? '' };
  if (row.is_caption) return { role: 'user', text: `${CAPTION_MARK} ${row.text ?? ''}` };
  return { role: 'user', text: row.image_key === null ? row.text : describePhotoMessage(row.text) };
}

function describePhotoMessage(text: string | null): string {
  return text === null ? PHOTO_MARK : `${PHOTO_MARK} ${text}`;
}
