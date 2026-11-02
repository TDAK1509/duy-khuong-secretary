import { z } from 'zod';
import type { ToolCall } from '../../../services/chat/chat-service.ts';
import type { AccessScope } from '../../access/access-scope.ts';
import { reloadAccessScope } from '../../access/reload-access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { runCountRecords } from './count-records-tool.ts';
import { runListMembers } from './list-members-tool.ts';
import { runSearchRecords } from './search-records-tool.ts';
import { failInvalidArgument, failTool, REFUSAL_ERROR } from './tool-result.ts';

export async function runAdminTool(database: Database, caller: AccessScope, call: ToolCall): Promise<string> {
  const scope = await reloadAccessScope(database, caller);
  if (scope === null || scope.role !== 'admin') return failTool(REFUSAL_ERROR);
  return runToolByName(database, scope, call);
}

async function runToolByName(database: Database, scope: AccessScope, call: ToolCall): Promise<string> {
  try {
    return await dispatchTool(database, scope, call);
  } catch (error) {
    if (error instanceof z.ZodError) return failInvalidArgument(String(error.issues[0]?.path[0] ?? 'arguments'));
    if (error instanceof SyntaxError) return failInvalidArgument('arguments');
    throw error;
  }
}

async function dispatchTool(database: Database, scope: AccessScope, call: ToolCall): Promise<string> {
  const parsedArguments: unknown = JSON.parse(call.argumentsJson);
  switch (call.name) {
    case 'search_records':
      return runSearchRecords(database, scope, parsedArguments);
    case 'count_records':
      return runCountRecords(database, scope, parsedArguments);
    case 'list_members':
      return runListMembers(database, scope);
    default:
      return failInvalidArgument('name');
  }
}
