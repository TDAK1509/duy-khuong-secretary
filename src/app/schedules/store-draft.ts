import { runInTransaction, type Database } from '../db/transaction.ts';
import type { NewDraft } from './schedule.ts';

export async function storeDraft(database: Database, draft: NewDraft): Promise<string> {
  return runInTransaction(database, async (transaction) => {
    const [stored] = await transaction.query<{ id: string }>(
      `INSERT INTO scheduled_tasks (workspace_id, created_by, title, instruction, repeat, time_of_day)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [draft.workspaceId, draft.createdBy, draft.title, draft.instruction, draft.schedule.repeat, draft.schedule.timeOfDay],
    );
    if (!stored) throw new Error('the draft was not stored');
    return stored.id;
  });
}
