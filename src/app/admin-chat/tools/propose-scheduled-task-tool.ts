import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { storeDraft } from '../../schedules/store-draft.ts';
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
  { database }: AdminToolDependencies,
  scope: AccessScope,
  parsedArguments: unknown,
): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const schedule = { repeat: 'daily' as const, timeOfDay: args.time_of_day ?? '' };
  await storeDraft(database, { workspaceId: scope.workspaceId, createdBy: scope.userId, title: args.title, instruction: args.instruction, schedule });
  return JSON.stringify({ ok: true, draft: true });
}
