import type { ChatTurn } from '../../services/chat/chat-service.ts';
import type { Database } from '../db/transaction.ts';
import type { IntakeSender } from '../intake/find-intake-sender.ts';

const HISTORY_LIMIT = 20;
const PHOTO_MARK = '[ảnh]';

type HistoryRow = { author: 'user' | 'bot'; text: string | null; image_key: string | null };

export async function loadHistoryTurns(
  database: Database,
  sender: IntakeSender,
  joinedAt: Date,
  currentMessageId: string,
): Promise<ChatTurn[]> {
  const { rows } = await database.query<HistoryRow>(
    `SELECT author, text, image_key FROM messages
     WHERE workspace_id = $1 AND user_id = $2 AND created_at >= $3
       AND id <> $4 AND reply_to IS DISTINCT FROM $4
     ORDER BY created_at DESC, id DESC
     LIMIT $5`,
    [sender.workspaceId, sender.userId, joinedAt, currentMessageId, HISTORY_LIMIT],
  );
  return rows.reverse().map(toTurn);
}

function toTurn(row: HistoryRow): ChatTurn {
  if (row.author === 'bot') return { role: 'assistant', text: row.text ?? '' };
  return { role: 'user', text: row.image_key === null ? row.text : describePhotoMessage(row.text), image: null };
}

function describePhotoMessage(text: string | null): string {
  return text === null ? PHOTO_MARK : `${PHOTO_MARK} ${text}`;
}
