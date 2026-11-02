import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { computeNextRun } from '../../schedules/compute-next-run.ts';
import { formatSchedule } from '../../schedules/format-schedule.ts';
import { storeDraft } from '../../schedules/store-draft.ts';
import { formatVietnamDateTime } from '../../workspaces/format-expiry.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const argumentsSchema = z.object({
  title: z.string(),
  instruction: z.string(),
  repeat: z.enum(['once', 'daily', 'weekly', 'monthly']),
  run_once_at: z.string().nullable(),
  time_of_day: z.string().nullable(),
  weekday: z.number().int().nullable(),
  day_of_month: z.number().int().nullable(),
});

export async function runProposeScheduledTask(
  { database, clock, drafts }: AdminToolDependencies,
  scope: AccessScope,
  parsedArguments: unknown,
): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const schedule = { repeat: 'daily' as const, timeOfDay: args.time_of_day ?? '' };
  const taskId = await storeDraft(database, { workspaceId: scope.workspaceId, createdBy: scope.userId, title: args.title, instruction: args.instruction, schedule });
  drafts.record({ taskId });
  const firstRun = computeNextRun(schedule, clock.now());
  return JSON.stringify({ ok: true, draft: true, schedule: formatSchedule(schedule), first_run: formatVietnamDateTime(firstRun) });
}
