import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceTasks } from './lock-workspace-tasks.ts';
import { toStoredRules } from './maintenance-rules.ts';
import type { NewDraft } from './schedule.ts';
import { toScheduleValues } from './schedule-columns.ts';

export const MAX_OPEN_TASKS_PER_WORKSPACE = 20;

export type StoredDraft = { taskId: string; replacedTitle: string | null };

export async function storeDraft(database: Database, draft: NewDraft): Promise<StoredDraft | null> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceTasks(transaction, draft.workspaceId);
    if (await isWorkspaceFull(transaction, draft)) return null;
    const replacedTitle = await cancelOlderDraft(transaction, draft);
    return { taskId: await insertDraft(transaction, draft), replacedTitle };
  });
}

async function isWorkspaceFull(transaction: Transaction, { workspaceId, createdBy }: NewDraft): Promise<boolean> {
  const [open] = await transaction.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM scheduled_tasks
     WHERE workspace_id = $1 AND status IN ('draft', 'active') AND NOT (status = 'draft' AND created_by = $2)`,
    [workspaceId, createdBy],
  );
  return (open?.count ?? 0) >= MAX_OPEN_TASKS_PER_WORKSPACE;
}

async function cancelOlderDraft(transaction: Transaction, { workspaceId, createdBy }: NewDraft): Promise<string | null> {
  const [replaced] = await transaction.query<{ title: string }>(
    `UPDATE scheduled_tasks SET status = 'cancelled'
     WHERE workspace_id = $1 AND created_by = $2 AND status = 'draft'
     RETURNING title`,
    [workspaceId, createdBy],
  );
  return replaced?.title ?? null;
}

async function insertDraft(transaction: Transaction, draft: NewDraft): Promise<string> {
  const [stored] = await transaction.query<{ id: string }>(
    `INSERT INTO scheduled_tasks
       (workspace_id, created_by, title, instruction, repeat, run_once_at, time_of_day, weekday, day_of_month, maintenance_rules)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      draft.workspaceId,
      draft.createdBy,
      draft.title,
      draft.instruction,
      ...toScheduleValues(draft.schedule),
      JSON.stringify(toStoredRules(draft.maintenanceRules)),
    ],
  );
  if (!stored) throw new Error('the draft was not stored');
  return stored.id;
}
