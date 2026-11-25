import { z } from 'zod';
import type { ToolCall } from '../../../services/chat/chat-service.ts';
import type { AccessScope } from '../../access/access-scope.ts';
import { toDatabaseScope } from '../../access/to-database-scope.ts';
import { scopeDatabase } from '../../db/scoped-database.ts';
import type { DatabaseScope } from '../../db/transaction.ts';
import { MEMORY_TOOLS } from './memory-tools.ts';
import { reloadAccessScope } from '../../access/reload-access-scope.ts';
import { runAttachPhotos } from './attach-photos-tool.ts';
import { runCancelScheduledTask } from './cancel-scheduled-task-tool.ts';
import { runCountRecords } from './count-records-tool.ts';
import { runCreateScheduledTask } from './create-scheduled-task-tool.ts';
import { runCreateInvite } from './create-invite-tool.ts';
import { runAddMemberFact, runForgetAllMemberFacts, runForgetMemberFact, runListMemberFacts } from './member-fact-tools.ts';
import { runListDocumentNumbers } from './list-document-numbers-tool.ts';
import { runExportDocumentsXlsx } from './export-documents-xlsx-tool.ts';
import { runListDocuments } from './list-documents-tool.ts';
import { runListMembers } from './list-members-tool.ts';
import { runListMergedNames } from './list-merged-names-tool.ts';
import { runListOrganizations } from './list-organizations-tool.ts';
import { runListSources } from './list-sources-tool.ts';
import { runListScheduledTasks } from './list-scheduled-tasks-tool.ts';
import { runMaintenanceStatus } from './maintenance-status-tool.ts';
import { runForgetAll } from './forget-all-tool.ts';
import { runForget } from './forget-tool.ts';
import { runRemember } from './remember-tool.ts';
import { runRemoveMember } from './remove-member-tool.ts';
import { runRewriteMemberPlate } from './rewrite-member-plate-tool.ts';
import { runSaveFact } from './save-fact-tool.ts';
import { runListFacts } from './list-facts-tool.ts';
import { runUpdateFact } from './update-fact-tool.ts';
import { runDeleteFact } from './delete-fact-tool.ts';
import { runDeleteDocumentTemplate } from './delete-document-template-tool.ts';
import { runListDocumentTemplates } from './list-document-templates-tool.ts';
import { runProposeDocumentTemplates } from './propose-document-templates-tool.ts';
import { runSaveDocumentTemplate } from './save-document-template-tool.ts';
import { runTotalFactValues } from './total-fact-values-tool.ts';
import { runDeleteRule, runListRules, runSaveRule } from './workspace-rule-tools.ts';
import { runExportReportXlsx } from './export-report-xlsx-tool.ts';
import { runExportTripReportXlsx } from './export-trip-report-xlsx-tool.ts';
import { runSearchRecords } from './search-records-tool.ts';
import { runSplitMergedName } from './split-merged-name-tool.ts';
import { runTotalDocumentNumbers } from './total-document-numbers-tool.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { CHANGE_REFUSED_ERROR, failInvalidArgument, failTool, REFUSAL_ERROR, ToolRefusal } from './tool-result.ts';

export async function runAdminTool(dependencies: AdminToolDependencies, caller: AccessScope, call: ToolCall): Promise<string> {
  const scope = await reloadAccessScope(dependencies.database, caller);
  if (scope === null || scope.role !== 'admin') return failTool(REFUSAL_ERROR);
  return runGuardedTool(dependencies, scope, call);
}

export async function runGuardedTool(dependencies: AdminToolDependencies, scope: AccessScope, call: ToolCall): Promise<string> {
  if (dependencies.guard.refuses(call.name)) return failTool(CHANGE_REFUSED_ERROR);
  dependencies.guard.noteCall(call.name);
  return runToolInScope(dependencies, scope, call);
}

export async function runToolInScope(dependencies: AdminToolDependencies, scope: AccessScope, call: ToolCall): Promise<string> {
  const database = scopeDatabase(dependencies.database, toToolDatabaseScope(scope, call.name));
  return runToolByName({ ...dependencies, database }, scope, call);
}

function toToolDatabaseScope(scope: AccessScope, toolName: string): DatabaseScope {
  const isMemoryTool = MEMORY_TOOLS.some((tool) => tool.name === toolName);
  return isMemoryTool ? { workspaceId: scope.workspaceId, ownerUserId: scope.userId } : toDatabaseScope(scope);
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
  list_member_facts: ({ database }, scope, args) => runListMemberFacts(database, scope, args),
  forget_member_fact: ({ database }, scope, args) => runForgetMemberFact(database, scope, args),
  forget_all_member_facts: ({ database }, scope, args) => runForgetAllMemberFacts(database, scope, args),
  add_member_fact: ({ database }, scope, args) => runAddMemberFact(database, scope, args),
  rewrite_member_plate: ({ database }, scope, args) => runRewriteMemberPlate(database, scope, args),
  save_fact: ({ database, companyReader }, scope, args) => runSaveFact(database, scope, args, companyReader ?? null),
  list_facts: ({ database }, scope, args) => runListFacts(database, scope, args),
  update_fact: ({ database }, scope, args) => runUpdateFact(database, scope, args),
  delete_fact: ({ database }, scope, args) => runDeleteFact(database, scope, args),
  total_fact_values: ({ database }, scope, args) => runTotalFactValues(database, scope, args),
  save_rule: runSaveRule,
  list_rules: ({ database }, scope, args) => runListRules(database, scope, args),
  delete_rule: ({ database }, scope, args) => runDeleteRule(database, scope, args),
  propose_document_templates: ({ database }, scope, args) => runProposeDocumentTemplates(database, scope, args),
  save_document_template: ({ database }, scope, args) => runSaveDocumentTemplate(database, scope, args),
  list_document_templates: ({ database }, scope, args) => runListDocumentTemplates(database, scope, args),
  delete_document_template: ({ database }, scope, args) => runDeleteDocumentTemplate(database, scope, args),
  maintenance_status: runMaintenanceStatus,
  attach_photos: runAttachPhotos,
  list_sources: runListSources,
  create_scheduled_task: runCreateScheduledTask,
  list_scheduled_tasks: ({ database }, scope, args) => runListScheduledTasks(database, scope, args),
  cancel_scheduled_task: ({ database }, scope, args) => runCancelScheduledTask(database, scope, args),
  remember: ({ database }, scope, args) => runRemember(database, scope, args),
  forget: ({ database }, scope, args) => runForget(database, scope, args),
  forget_all: ({ database }, scope, args) => runForgetAll(database, scope, args),
  list_document_numbers: ({ database }, scope, args) => runListDocumentNumbers(database, scope, args),
  list_documents: ({ database }, scope, args) => runListDocuments(database, scope, args),
  list_merged_names: ({ database }, scope, args) => runListMergedNames(database, scope, args),
  list_organizations: ({ database }, scope, args) => runListOrganizations(database, scope, args),
  split_merged_name: ({ database }, scope, args) => runSplitMergedName(database, scope, args),
  total_document_numbers: ({ database }, scope, args) => runTotalDocumentNumbers(database, scope, args),
  export_documents_xlsx: (deps, scope, args) => runExportDocumentsXlsx(deps, scope, args),
  export_report_xlsx: (deps, scope, args) => runExportReportXlsx(deps, scope, args),
  export_trip_report_xlsx: (deps, scope, args) => runExportTripReportXlsx(deps, scope, args),
};

async function dispatchTool(dependencies: AdminToolDependencies, scope: AccessScope, call: ToolCall): Promise<string> {
  const parsedArguments: unknown = JSON.parse(call.argumentsJson);
  const runner = Object.hasOwn(TOOL_RUNNERS, call.name) ? TOOL_RUNNERS[call.name] : undefined;
  return runner ? runner(dependencies, scope, parsedArguments) : failInvalidArgument('name');
}
