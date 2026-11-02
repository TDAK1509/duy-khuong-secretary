import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { computeNextRun } from '../../schedules/compute-next-run.ts';
import { formatSchedule } from '../../schedules/format-schedule.ts';
import { MAX_OPEN_TASKS_PER_WORKSPACE, storeDraft } from '../../schedules/store-draft.ts';
import { formatVietnamDateTime } from '../../workspaces/format-expiry.ts';
import { readProposedSchedule } from './read-proposed-schedule.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { failTool } from './tool-result.ts';

const RUN_TIME_PASSED_ERROR = 'Thời điểm chạy đã qua.';
const WORKSPACE_FULL_ERROR = `Nhóm đã có ${MAX_OPEN_TASKS_PER_WORKSPACE} lịch. Xóa bớt lịch cũ trước.`;

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
  const schedule = readProposedSchedule(args);
  const firstRun = computeNextRun(schedule, clock.now());
  if (firstRun === null) return failTool(RUN_TIME_PASSED_ERROR);
  const stored = await storeDraft(database, { workspaceId: scope.workspaceId, createdBy: scope.userId, title: args.title, instruction: args.instruction, schedule });
  if (stored === null) return failTool(WORKSPACE_FULL_ERROR);
  drafts.record(stored);
  return JSON.stringify({ ok: true, draft: true, schedule: formatSchedule(schedule), first_run: formatVietnamDateTime(firstRun) });
}
