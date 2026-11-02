import { runInTransaction, type Database } from '../db/transaction.ts';
import type { NewDraft } from './schedule.ts';

export type StoredDraft = { taskId: string; replacedTitle: string | null };

export async function storeDraft(database: Database, draft: NewDraft): Promise<StoredDraft> {
  return runInTransaction(database, async (transaction) => {
    const [replaced] = await transaction.query<{ title: string }>(
      `UPDATE scheduled_tasks SET status = 'cancelled'
       WHERE workspace_id = $1 AND created_by = $2 AND status = 'draft'
       RETURNING title`,
      [draft.workspaceId, draft.createdBy],
    );
    const [stored] = await transaction.query<{ id: string }>(
      `INSERT INTO scheduled_tasks (workspace_id, created_by, title, instruction, repeat, time_of_day)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [draft.workspaceId, draft.createdBy, draft.title, draft.instruction, draft.schedule.repeat, draft.schedule.timeOfDay],
    );
    if (!stored) throw new Error('the draft was not stored');
    return { taskId: stored.id, replacedTitle: replaced?.title ?? null };
  });
}
