import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { computeNextRun } from './compute-next-run.ts';
import { lockWorkspaceTasks } from './lock-workspace-tasks.ts';
import type { NewScheduledTask, Schedule } from './schedule.ts';
import { readSchedule, SCHEDULE_COLUMNS, toScheduleValues, type ScheduleRow } from './schedule-columns.ts';

export const MAX_ACTIVE_TASKS_PER_WORKSPACE = 20;

export type StoredTask = { taskId: string; schedule: Schedule; firstRun: Date };

type ExistingTaskRow = ScheduleRow & { id: string; next_run_at: Date | null };

export type StoreOutcome = { kind: 'stored'; task: StoredTask } | { kind: 'run_time_passed' } | { kind: 'workspace_full' };

export async function storeScheduledTask(database: Database, task: NewScheduledTask, now: Date): Promise<StoreOutcome> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceTasks(transaction, task.workspaceId);
    const existing = await findTaskByCreationKey(transaction, task.creationKey, now);
    if (existing !== null) return { kind: 'stored', task: existing };
    return storeNewTask(transaction, task, now);
  });
}

async function storeNewTask(transaction: Transaction, task: NewScheduledTask, now: Date): Promise<StoreOutcome> {
  const firstRun = computeNextRun(task.schedule, now);
  if (firstRun === null) return { kind: 'run_time_passed' };
  if (await isWorkspaceFull(transaction, task.workspaceId)) return { kind: 'workspace_full' };
  const taskId = await insertTask(transaction, task, firstRun);
  return { kind: 'stored', task: { taskId, schedule: task.schedule, firstRun } };
}

async function findTaskByCreationKey(transaction: Transaction, creationKey: string, now: Date): Promise<StoredTask | null> {
  const [existing] = await transaction.query<ExistingTaskRow>(
    `SELECT id, next_run_at, ${SCHEDULE_COLUMNS} FROM scheduled_tasks WHERE creation_key = $1`,
    [creationKey],
  );
  if (!existing) return null;
  const schedule = readSchedule(existing);
  return { taskId: existing.id, schedule, firstRun: existing.next_run_at ?? findFirstRunOfStoredTask(schedule, now) };
}

function findFirstRunOfStoredTask(schedule: Schedule, now: Date): Date {
  if (schedule.repeat === 'once') return schedule.runOnceAt;
  return computeNextRun(schedule, now) ?? now;
}

async function isWorkspaceFull(transaction: Transaction, workspaceId: string): Promise<boolean> {
  const [active] = await transaction.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM scheduled_tasks WHERE workspace_id = $1 AND status = 'active'`,
    [workspaceId],
  );
  return (active?.count ?? 0) >= MAX_ACTIVE_TASKS_PER_WORKSPACE;
}

async function insertTask(transaction: Transaction, task: NewScheduledTask, firstRun: Date): Promise<string> {
  const [stored] = await transaction.query<{ id: string }>(
    `INSERT INTO scheduled_tasks
       (workspace_id, created_by, title, instruction, repeat, run_once_at, time_of_day, weekday, day_of_month,
        status, next_run_at, creation_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11) RETURNING id`,
    [
      task.workspaceId,
      task.createdBy,
      task.title,
      task.instruction,
      ...toScheduleValues(task.schedule),
      firstRun,
      task.creationKey,
    ],
  );
  if (!stored) throw new Error('the task was not stored');
  return stored.id;
}
