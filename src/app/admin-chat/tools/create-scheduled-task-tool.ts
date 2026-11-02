import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { computeNextRun } from '../../schedules/compute-next-run.ts';
import { formatSchedule } from '../../schedules/format-schedule.ts';
import type { MaintenanceRule, NewScheduledTask } from '../../schedules/schedule.ts';
import { MAX_ACTIVE_TASKS_PER_WORKSPACE, storeScheduledTask } from '../../schedules/store-scheduled-task.ts';
import { formatVietnamDateTime } from '../../workspaces/format-expiry.ts';
import { hasLengthBetween } from '../../workspaces/invite-rules.ts';
import { readTaskSchedule } from './read-task-schedule.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { failTool, refuseInvalidArgument, REFUSAL_ERROR } from './tool-result.ts';

const MAX_TITLE_LENGTH = 80;
const MAX_INSTRUCTION_LENGTH = 2000;
const RUN_TIME_PASSED_ERROR = 'Thời điểm chạy đã qua.';
const WORKSPACE_FULL_ERROR = `Nhóm đã có ${MAX_ACTIVE_TASKS_PER_WORKSPACE} lịch. Xóa bớt lịch cũ trước.`;

const argumentsSchema = z.object({
  title: z.string(),
  instruction: z.string(),
  repeat: z.enum(['once', 'daily', 'weekly', 'monthly']),
  run_once_at: z.string().nullable(),
  time_of_day: z.string().nullable(),
  weekday: z.number().int().nullable(),
  day_of_month: z.number().int().nullable(),
  maintenance_rules: z.array(z.object({ maintenance_item: z.string().trim().min(1), age_days: z.number().int().min(1) })),
});

type TaskArguments = z.infer<typeof argumentsSchema>;

export async function runCreateScheduledTask(
  { database, clock, created }: AdminToolDependencies,
  scope: AccessScope,
  parsedArguments: unknown,
): Promise<string> {
  const creationKey = created.takeNextCreationKey();
  if (creationKey === null) return failTool(REFUSAL_ERROR);
  const task = readTask(argumentsSchema.parse(parsedArguments), scope, creationKey);
  const firstRun = computeNextRun(task.schedule, clock.now());
  if (firstRun === null) return failTool(RUN_TIME_PASSED_ERROR);
  const stored = await storeScheduledTask(database, task, firstRun);
  if (stored === null) return failTool(WORKSPACE_FULL_ERROR);
  created.record(stored.taskId);
  const schedule = formatSchedule(stored.schedule);
  return JSON.stringify({ ok: true, draft: true, schedule, first_run: formatVietnamDateTime(stored.firstRun) });
}

function readTask(args: TaskArguments, scope: AccessScope, creationKey: string): NewScheduledTask {
  return {
    workspaceId: scope.workspaceId,
    createdBy: scope.userId,
    creationKey,
    title: readText(args.title, 'title', MAX_TITLE_LENGTH),
    instruction: readText(args.instruction, 'instruction', MAX_INSTRUCTION_LENGTH),
    schedule: readTaskSchedule(args),
    maintenanceRules: args.maintenance_rules.map(readRule),
  };
}

function readRule(rule: TaskArguments['maintenance_rules'][number]): MaintenanceRule {
  return { maintenanceItem: rule.maintenance_item.toLowerCase(), ageDays: rule.age_days };
}

function readText(text: string, field: string, maxLength: number): string {
  const trimmed = text.trim();
  return hasLengthBetween(trimmed, maxLength) ? trimmed : refuseInvalidArgument(field);
}
