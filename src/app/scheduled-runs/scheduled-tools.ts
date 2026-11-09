import type { ToolCall, ToolSpec } from '../../services/chat/chat-service.ts';
import type { AccessScope } from '../access/access-scope.ts';
import {
  COUNT_RECORDS_SPEC,
  LIST_MEMBERS_SPEC,
  MAINTENANCE_STATUS_SPEC,
  SEARCH_RECORDS_SPEC,
} from '../admin-chat/tools/tool-specs.ts';
import { LIST_DOCUMENT_NUMBERS_SPEC, LIST_ORGANIZATIONS_SPEC, TOTAL_DOCUMENT_NUMBERS_SPEC } from '../admin-chat/tools/document-number-specs.ts';
import { runAdminTool } from '../admin-chat/tools/run-admin-tool.ts';
import type { AdminToolDependencies } from '../admin-chat/tools/tool-dependencies.ts';
import { failInvalidArgument } from '../admin-chat/tools/tool-result.ts';

export const SCHEDULED_RUN_TOOLS: ToolSpec[] = [
  SEARCH_RECORDS_SPEC,
  COUNT_RECORDS_SPEC,
  MAINTENANCE_STATUS_SPEC,
  LIST_MEMBERS_SPEC,
  LIST_DOCUMENT_NUMBERS_SPEC,
  TOTAL_DOCUMENT_NUMBERS_SPEC,
  LIST_ORGANIZATIONS_SPEC,
];

export async function runScheduledTool(dependencies: AdminToolDependencies, caller: AccessScope, call: ToolCall): Promise<string> {
  const isOffered = SCHEDULED_RUN_TOOLS.some((tool) => tool.name === call.name);
  return isOffered ? runAdminTool(dependencies, caller, call) : failInvalidArgument('name');
}
