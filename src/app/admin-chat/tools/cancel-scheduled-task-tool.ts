import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { cancelTask } from '../../schedules/cancel-task.ts';
import { failTool } from './tool-result.ts';

const NOT_FOUND_ERROR = 'Không tìm thấy lịch này.';

const argumentsSchema = z.object({ task_id: z.string() });
const uuidSchema = z.uuid();

export async function runCancelScheduledTask(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  if (!uuidSchema.safeParse(args.task_id).success) return failTool(NOT_FOUND_ERROR);
  const title = await cancelTask(database, scope, args.task_id);
  return title === null ? failTool(NOT_FOUND_ERROR) : JSON.stringify({ ok: true, title });
}
