import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { formatSchedule } from '../../schedules/format-schedule.ts';
import { listActiveTasks } from '../../schedules/list-active-tasks.ts';
import { formatVietnamDateTime } from '../../workspaces/format-expiry.ts';

const argumentsSchema = z.object({ scope: z.enum(['mine', 'all']) });

export async function runListScheduledTasks(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { scope: owner } = argumentsSchema.parse(parsedArguments);
  const tasks = await listActiveTasks(database, scope, owner);
  return JSON.stringify({
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      instruction: task.instruction,
      schedule: formatSchedule(task.schedule),
      next_run: task.nextRunAt === null ? null : formatVietnamDateTime(task.nextRunAt),
      last_run: task.lastRunAt === null ? null : formatVietnamDateTime(task.lastRunAt),
      creator: task.creatorName,
      mine: task.isMine,
    })),
  });
}
