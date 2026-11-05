import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ToolSpec } from '../../services/chat/chat-service.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { McpServerDefinition, McpTool, McpToolAnnotations, McpToolResult } from '../../services/mcp/mcp-endpoint.ts';
import type { AccessScope } from '../access/access-scope.ts';
import { CreatedInvites } from '../admin-chat/created-invites.ts';
import { CreatedTasks } from '../admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../admin-chat/photo-attachments.ts';
import { AdminTextGuard } from '../admin-chat/tools/admin-text-guard.ts';
import { runAdminTool } from '../admin-chat/tools/run-admin-tool.ts';
import type { AdminToolDependencies } from '../admin-chat/tools/tool-dependencies.ts';
import {
  CANCEL_SCHEDULED_TASK_SPEC,
  COUNT_RECORDS_SPEC,
  CREATE_INVITE_SPEC,
  CREATE_SCHEDULED_TASK_SPEC,
  LIST_MEMBERS_SPEC,
  LIST_SCHEDULED_TASKS_SPEC,
  MAINTENANCE_STATUS_SPEC,
  REMOVE_MEMBER_SPEC,
  SEARCH_RECORDS_SPEC,
} from '../admin-chat/tools/tool-specs.ts';
import type { Database } from '../db/transaction.ts';
import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import { ATTACH_PHOTOS_MCP_SPEC } from './attach-photos-mcp-spec.ts';
import { MCP_SERVER_IDENTITY } from './mcp-server-identity.ts';

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const CHANGE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const READ_TOOL_SPECS = [SEARCH_RECORDS_SPEC, COUNT_RECORDS_SPEC, LIST_MEMBERS_SPEC, MAINTENANCE_STATUS_SPEC, LIST_SCHEDULED_TASKS_SPEC];
const CHANGE_TOOL_SPECS = [CREATE_INVITE_SPEC, REMOVE_MEMBER_SPEC, CREATE_SCHEDULED_TASK_SPEC, CANCEL_SCHEDULED_TASK_SPEC];
const failedOutputSchema = z.object({ ok: z.literal(false) });

export type McpRuntime = { database: Database; clock: Clock; photoStorage: PhotoStorage | null };

export function describeMcpServer(runtime: McpRuntime, scope: AccessScope): McpServerDefinition {
  const readTools = READ_TOOL_SPECS.map((spec) => describeTool(runtime, scope, spec, READ_ONLY_ANNOTATIONS));
  const photoTools = runtime.photoStorage === null ? [] : [describeTool(runtime, scope, ATTACH_PHOTOS_MCP_SPEC, READ_ONLY_ANNOTATIONS)];
  const changeTools = CHANGE_TOOL_SPECS.map((spec) => describeTool(runtime, scope, spec, CHANGE_ANNOTATIONS));
  return { ...MCP_SERVER_IDENTITY, tools: [...readTools, ...photoTools, ...changeTools] };
}

function describeTool(runtime: McpRuntime, scope: AccessScope, { name, description, parameters }: ToolSpec, annotations: McpToolAnnotations): McpTool {
  return {
    name,
    description,
    inputSchema: parameters,
    annotations,
    securitySchemes: [{ type: 'oauth2' }],
    call: (args) => callAdminTool(runtime, scope, name, args),
  };
}

async function callAdminTool(runtime: McpRuntime, scope: AccessScope, name: string, args: unknown): Promise<McpToolResult> {
  const call = { id: randomUUID(), name, argumentsJson: JSON.stringify(args) };
  const text = await runAdminTool(buildAdminToolDependencies(runtime), scope, call);
  return { text, isError: failedOutputSchema.safeParse(JSON.parse(text)).success };
}

function buildAdminToolDependencies({ database, clock }: McpRuntime): AdminToolDependencies {
  return {
    database,
    clock,
    attachments: new PhotoAttachments(),
    created: new CreatedTasks(randomUUID()),
    invites: new CreatedInvites(),
    guard: new AdminTextGuard(false),
  };
}
