import type { ToolCall } from '../../../services/chat/chat-service.ts';
import type { AccessScope } from '../../access/access-scope.ts';
import { reloadAccessScope } from '../../access/reload-access-scope.ts';
import { listChatTools } from './chat-tools.ts';
import { runGuardedTool, runToolInScope } from './run-admin-tool.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { failTool, REFUSAL_ERROR } from './tool-result.ts';

export async function runChatTool(dependencies: AdminToolDependencies, caller: AccessScope, call: ToolCall): Promise<string> {
  const scope = await reloadAccessScope(dependencies.database, caller);
  if (scope === null || scope.role !== caller.role) return failTool(REFUSAL_ERROR);
  if (!listChatTools(scope.role).some((tool) => tool.name === call.name)) return failTool(REFUSAL_ERROR);
  return scope.role === 'admin' ? runGuardedTool(dependencies, scope, call) : runToolInScope(dependencies, scope, call);
}
