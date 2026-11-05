import type { Transaction } from '../db/transaction.ts';
import type { IntakeSender } from './find-intake-sender.ts';

export async function hasOtherWaitingPhoto(transaction: Transaction, sender: IntakeSender, photoId: string): Promise<boolean> {
  const rows = await transaction.query(
    `SELECT 1 FROM messages
     WHERE workspace_id = $1 AND user_id = $2 AND id <> $3 AND submission_status IN ('needs_explanation', 'asked_again')`,
    [sender.workspaceId, sender.userId, photoId],
  );
  return rows.length > 0;
}
