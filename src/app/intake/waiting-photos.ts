import { readStoredCodeChoice, type CodeChoice } from '../reading/code-choice.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import type { IntakeSender } from './find-intake-sender.ts';

const QUESTION_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type AskedPhoto = { id: string; imageKey: string; status: 'needs_explanation' | 'asked_again'; codeChoice: CodeChoice | null };

export function findAskedPhoto(database: Database, sender: IntakeSender): Promise<AskedPhoto | null> {
  return runInTransaction(database, (transaction) => findOldestWaitingPhoto(transaction, sender));
}

export async function findOldestWaitingPhoto(transaction: Transaction, sender: IntakeSender): Promise<AskedPhoto | null> {
  const [row] = await transaction.query<{ id: string; image_key: string; submission_status: AskedPhoto['status']; code_choice: unknown }>(
    `SELECT id, image_key, submission_status, code_choice FROM messages
     WHERE workspace_id = $1 AND user_id = $2 AND submission_status IN ('needs_explanation', 'asked_again')
     ORDER BY created_at, id LIMIT 1`,
    [sender.workspaceId, sender.userId],
  );
  return row
    ? { id: row.id, imageKey: row.image_key, status: row.submission_status, codeChoice: readStoredCodeChoice(row.code_choice) }
    : null;
}

export async function hasOtherWaitingPhoto(transaction: Transaction, sender: IntakeSender, photoId: string): Promise<boolean> {
  const rows = await transaction.query(
    `SELECT 1 FROM messages
     WHERE workspace_id = $1 AND user_id = $2 AND id <> $3 AND submission_status IN ('needs_explanation', 'asked_again')`,
    [sender.workspaceId, sender.userId, photoId],
  );
  return rows.length > 0;
}

export async function endExpiredWaits(transaction: Transaction, sender: IntakeSender, now: Date): Promise<void> {
  await transaction.query(
    `UPDATE messages SET submission_status = 'unresolved'
     WHERE workspace_id = $1 AND user_id = $2 AND submission_status IN ('needs_explanation', 'asked_again')
       AND (SELECT ask.created_at
            FROM messages photo LEFT JOIN messages ask ON ask.reply_to = photo.id
            WHERE photo.workspace_id = $1 AND photo.user_id = $2 AND photo.submission_status IN ('needs_explanation', 'asked_again')
            ORDER BY photo.created_at, photo.id LIMIT 1) < $3`,
    [sender.workspaceId, sender.userId, new Date(now.getTime() - QUESTION_LIFETIME_MS)],
  );
}
