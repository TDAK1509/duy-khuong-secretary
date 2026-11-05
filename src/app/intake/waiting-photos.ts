import type { Database, Transaction } from '../db/transaction.ts';
import type { IntakeSender } from './find-intake-sender.ts';

export type AskedPhoto = { id: string; imageKey: string };

export async function findAskedPhoto(database: Database, sender: IntakeSender): Promise<AskedPhoto | null> {
  const { rows } = await database.query<{ id: string; image_key: string }>(
    `SELECT id, image_key FROM messages
     WHERE workspace_id = $1 AND user_id = $2 AND submission_status IN ('needs_explanation', 'asked_again')
     ORDER BY created_at, id LIMIT 1`,
    [sender.workspaceId, sender.userId],
  );
  const [row] = rows;
  return row ? { id: row.id, imageKey: row.image_key } : null;
}

export async function hasOtherWaitingPhoto(transaction: Transaction, sender: IntakeSender, photoId: string): Promise<boolean> {
  const rows = await transaction.query(
    `SELECT 1 FROM messages
     WHERE workspace_id = $1 AND user_id = $2 AND id <> $3 AND submission_status IN ('needs_explanation', 'asked_again')`,
    [sender.workspaceId, sender.userId, photoId],
  );
  return rows.length > 0;
}
