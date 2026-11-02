import { z } from 'zod';
import type { ToolCall } from '../../../services/chat/chat-service.ts';
import type { AccessScope } from '../../access/access-scope.ts';
import { reloadAccessScope } from '../../access/reload-access-scope.ts';
import { runAttachPhotos } from './attach-photos-tool.ts';
import { runCountRecords } from './count-records-tool.ts';
import { runCreateInvite } from './create-invite-tool.ts';
import { runListMembers } from './list-members-tool.ts';
import { runMaintenanceStatus } from './maintenance-status-tool.ts';
import { runRemoveMember } from './remove-member-tool.ts';
import { runSearchRecords } from './search-records-tool.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { failInvalidArgument, failTool, REFUSAL_ERROR } from './tool-result.ts';

export async function runAdminTool(dependencies: AdminToolDependencies, caller: AccessScope, call: ToolCall): Promise<string> {
  const scope = await reloadAccessScope(dependencies.database, caller);
  if (scope === null || scope.role !== 'admin') return failTool(REFUSAL_ERROR);
  return runToolByName(dependencies, scope, call);
}

async function runToolByName(dependencies: AdminToolDependencies, scope: AccessScope, call: ToolCall): Promise<string> {
  try {
    return await dispatchTool(dependencies, scope, call);
  } catch (error) {
    if (error instanceof z.ZodError) return failInvalidArgument(String(error.issues[0]?.path[0] ?? 'arguments'));
    if (error instanceof SyntaxError) return failInvalidArgument('arguments');
    throw error;
  }
}

async function dispatchTool(dependencies: AdminToolDependencies, scope: AccessScope, call: ToolCall): Promise<string> {
  const { database } = dependencies;
  const parsedArguments: unknown = JSON.parse(call.argumentsJson);
  switch (call.name) {
    case 'search_records':
      return runSearchRecords(database, scope, parsedArguments);
    case 'count_records':
      return runCountRecords(database, scope, parsedArguments);
    case 'list_members':
      return runListMembers(database, scope);
    case 'create_invite':
      return runCreateInvite(dependencies, scope, parsedArguments);
    case 'remove_member':
      return runRemoveMember(database, scope, parsedArguments);
    case 'maintenance_status':
      return runMaintenanceStatus(dependencies, scope, parsedArguments);
    case 'attach_photos':
      return runAttachPhotos(dependencies, scope, parsedArguments);
    default:
      return failInvalidArgument('name');
  }
}
