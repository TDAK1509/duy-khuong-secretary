import type { AccessScope } from '../../access/access-scope.ts';
import { reloadAccessScope } from '../../access/reload-access-scope.ts';
import { describeError } from '../../errors/describe-error.ts';
import { runToolInScope } from '../tools/run-admin-tool.ts';
import type { AdminToolDependencies } from '../tools/tool-dependencies.ts';
import { failTool, REFUSAL_ERROR } from '../tools/tool-result.ts';
import { toToolCall, type StoredCall } from './stored-call.ts';

export type ConfirmedChange = { name: StoredCall['name']; output: string };

const CONFIRMED_CALL_FAILED_ERROR = 'Công cụ gặp lỗi khi chạy nên chưa làm được việc này.';

export async function runConfirmedCalls(dependencies: AdminToolDependencies, caller: AccessScope, calls: StoredCall[]): Promise<ConfirmedChange[]> {
  if (calls.length === 0) return [];
  const scope = await reloadAccessScope(dependencies.database, caller);
  const changes: ConfirmedChange[] = [];
  for (const [index, call] of calls.entries()) changes.push({ name: call.name, output: await runConfirmedCall(dependencies, scope, call, index) });
  return changes;
}

async function runConfirmedCall(dependencies: AdminToolDependencies, scope: AccessScope | null, call: StoredCall, index: number): Promise<string> {
  if (scope === null || scope.role !== 'admin') return failTool(REFUSAL_ERROR);
  try {
    return await runToolInScope(dependencies, scope, toToolCall(call, index));
  } catch (error) {
    console.log(`[confirmed-change] tool=${call.name} failed: ${describeError(error)}`);
    return failTool(CONFIRMED_CALL_FAILED_ERROR);
  }
}
