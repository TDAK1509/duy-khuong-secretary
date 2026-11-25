import type { Transaction } from '../../db/transaction.ts';

export type PhotoSender = { workspaceId: string; userId: string; currentMessageId: string };

const FIND_LAST_PHOTO_SQL = `
  SELECT message.id
  FROM messages message
  WHERE message.workspace_id = $1 AND message.user_id = $2 AND message.author = 'user' AND message.source <> 'mcp'
    AND message.image_key IS NOT NULL
    AND (message.created_at, message.id) < (SELECT current.created_at, current.id FROM messages current WHERE current.id = $3 AND current.workspace_id = $1)
  ORDER BY message.created_at DESC, message.id DESC
  LIMIT 1`;

export async function findLastPhotoMessage(transaction: Transaction, { workspaceId, userId, currentMessageId }: PhotoSender): Promise<string | null> {
  const [row] = await transaction.query<{ id: string }>(FIND_LAST_PHOTO_SQL, [workspaceId, userId, currentMessageId]);
  return row?.id ?? null;
}
