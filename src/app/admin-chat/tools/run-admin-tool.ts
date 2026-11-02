import type { ToolCall } from '../../../services/chat/chat-service.ts';
import type { AccessScope } from '../../access/access-scope.ts';
import { reloadAccessScope } from '../../access/reload-access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { runSearchRecords } from './search-records-tool.ts';
import { failInvalidArgument, failTool, REFUSAL_ERROR } from './tool-result.ts';

export async function runAdminTool(database: Database, caller: AccessScope, call: ToolCall): Promise<string> {
  const scope = await reloadAccessScope(database, caller);
  if (scope === null || scope.role !== 'admin') return failTool(REFUSAL_ERROR);
  return runToolByName(database, scope, call);
}

async function runToolByName(database: Database, scope: AccessScope, call: ToolCall): Promise<string> {
  const parsedArguments: unknown = JSON.parse(call.argumentsJson);
  switch (call.name) {
    case 'search_records':
      return runSearchRecords(database, scope, parsedArguments);
    default:
      return failInvalidArgument('name');
  }
}
