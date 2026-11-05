import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import type { IntakeSender } from './find-intake-sender.ts';

export type AskedPhoto = { id: string; imageKey: string; status: 'needs_explanation' | 'asked_again' };

export function findAskedPhoto(database: Database, sender: IntakeSender): Promise<AskedPhoto | null> {
  return runInTransaction(database, (transaction) => findOldestWaitingPhoto(transaction, sender));
}

export async function findOldestWaitingPhoto(transaction: Transaction, sender: IntakeSender): Promise<AskedPhoto | null> {
  const [row] = await transaction.query<{ id: string; image_key: string; submission_status: AskedPhoto['status'] }>(
    `SELECT id, image_key, submission_status FROM messages
     WHERE workspace_id = $1 AND user_id = $2 AND submission_status IN ('needs_explanation', 'asked_again')
     ORDER BY created_at, id LIMIT 1`,
    [sender.workspaceId, sender.userId],
  );
  return row ? { id: row.id, imageKey: row.image_key, status: row.submission_status } : null;
}

export async function hasOtherWaitingPhoto(transaction: Transaction, sender: IntakeSender, photoId: string): Promise<boolean> {
  const rows = await transaction.query(
    `SELECT 1 FROM messages
     WHERE workspace_id = $1 AND user_id = $2 AND id <> $3 AND submission_status IN ('needs_explanation', 'asked_again')`,
    [sender.workspaceId, sender.userId, photoId],
  );
  return rows.length > 0;
}
