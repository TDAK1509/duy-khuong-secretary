import { z } from 'zod';
import type { ToolCall } from '../../../services/chat/chat-service.ts';
import type { AccessScope } from '../../access/access-scope.ts';
import { toDatabaseScope } from '../../access/to-database-scope.ts';
import { scopeDatabase } from '../../db/scoped-database.ts';
import { reloadAccessScope } from '../../access/reload-access-scope.ts';
import { runAttachPhotos } from './attach-photos-tool.ts';
import { runCancelScheduledTask } from './cancel-scheduled-task-tool.ts';
import { runCountRecords } from './count-records-tool.ts';
import { runCreateScheduledTask } from './create-scheduled-task-tool.ts';
import { runCreateInvite } from './create-invite-tool.ts';
import { runListDocumentNumbers } from './list-document-numbers-tool.ts';
import { runListMembers } from './list-members-tool.ts';
import { runListNumberLabels } from './list-number-labels-tool.ts';
import { runListOrganizations } from './list-organizations-tool.ts';
import { runListScheduledTasks } from './list-scheduled-tasks-tool.ts';
import { runMaintenanceStatus } from './maintenance-status-tool.ts';
import { runRemoveMember } from './remove-member-tool.ts';
import { runReviewNameMatches } from './review-name-matches-tool.ts';
import { runSearchRecords } from './search-records-tool.ts';
import { runTotalDocumentNumbers } from './total-document-numbers-tool.ts';
import { runTotalNumbers } from './total-numbers-tool.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { CHANGE_REFUSED_ERROR, failInvalidArgument, failTool, REFUSAL_ERROR, ToolRefusal } from './tool-result.ts';

export async function runAdminTool(dependencies: AdminToolDependencies, caller: AccessScope, call: ToolCall): Promise<string> {
  const scope = await reloadAccessScope(dependencies.database, caller);
  if (scope === null || scope.role !== 'admin') return failTool(REFUSAL_ERROR);
  if (dependencies.guard.refuses(call.name)) return failTool(CHANGE_REFUSED_ERROR);
  dependencies.guard.noteCall(call.name);
  const database = scopeDatabase(dependencies.database, toDatabaseScope(scope));
  return runToolByName({ ...dependencies, database }, scope, call);
}

async function runToolByName(dependencies: AdminToolDependencies, scope: AccessScope, call: ToolCall): Promise<string> {
  try {
    return await dispatchTool(dependencies, scope, call);
  } catch (error) {
    if (error instanceof z.ZodError) return failInvalidArgument(String(error.issues[0]?.path[0] ?? 'arguments'));
    if (error instanceof ToolRefusal) return failTool(error.message);
    if (error instanceof SyntaxError) return failInvalidArgument('arguments');
    throw error;
  }
}

type ToolRunner = (dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown) => Promise<string>;

const TOOL_RUNNERS: Record<string, ToolRunner> = {
  search_records: ({ database }, scope, args) => runSearchRecords(database, scope, args),
  count_records: ({ database }, scope, args) => runCountRecords(database, scope, args),
  list_members: ({ database }, scope) => runListMembers(database, scope),
  create_invite: runCreateInvite,
  remove_member: ({ database }, scope, args) => runRemoveMember(database, scope, args),
  maintenance_status: runMaintenanceStatus,
  attach_photos: runAttachPhotos,
  create_scheduled_task: runCreateScheduledTask,
  list_scheduled_tasks: ({ database }, scope) => runListScheduledTasks(database, scope),
  cancel_scheduled_task: ({ database }, scope, args) => runCancelScheduledTask(database, scope, args),
  review_name_matches: runReviewNameMatches,
  list_number_labels: ({ database }, scope, args) => runListNumberLabels(database, scope, args),
  total_numbers: ({ database }, scope, args) => runTotalNumbers(database, scope, args),
  list_document_numbers: ({ database }, scope, args) => runListDocumentNumbers(database, scope, args),
  list_organizations: ({ database }, scope, args) => runListOrganizations(database, scope, args),
  total_document_numbers: ({ database }, scope, args) => runTotalDocumentNumbers(database, scope, args),
};

async function dispatchTool(dependencies: AdminToolDependencies, scope: AccessScope, call: ToolCall): Promise<string> {
  const parsedArguments: unknown = JSON.parse(call.argumentsJson);
  const runner = Object.hasOwn(TOOL_RUNNERS, call.name) ? TOOL_RUNNERS[call.name] : undefined;
  return runner ? runner(dependencies, scope, parsedArguments) : failInvalidArgument('name');
}
