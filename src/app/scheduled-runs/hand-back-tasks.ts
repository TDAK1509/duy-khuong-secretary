import type { Database } from '../db/transaction.ts';
import type { HeldTask } from './held-tasks.ts';

const HAND_BACK_SQL = `
  UPDATE scheduled_tasks SET locked_until = NULL
  FROM unnest($1::uuid[], $2::timestamptz[]) AS held(id, locked_until)
  WHERE scheduled_tasks.id = held.id AND scheduled_tasks.locked_until = held.locked_until
  RETURNING scheduled_tasks.id`;

export async function handBackTasks(database: Database, tasks: HeldTask[]): Promise<string[]> {
  if (tasks.length === 0) return [];
  const { rows } = await database.query<{ id: string }>(HAND_BACK_SQL, [tasks.map((task) => task.id), tasks.map((task) => task.claimedLockedUntil)]);
  return rows.map((row) => row.id);
}
