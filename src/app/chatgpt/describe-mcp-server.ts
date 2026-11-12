import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ToolSpec } from '../../services/chat/chat-service.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { McpServerDefinition, McpTool, McpToolAnnotations, McpToolResult } from '../../services/mcp/mcp-endpoint.ts';
import type { AccessScope } from '../access/access-scope.ts';
import { CreatedInvites } from '../admin-chat/created-invites.ts';
import { NameReviewRequest } from '../admin-chat/name-review-request.ts';
import { CreatedTasks } from '../admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../admin-chat/photo-attachments.ts';
import { SourceCards } from '../admin-chat/source-cards.ts';
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
import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { Photo, PhotoStorage } from '../../services/storage/photo-storage.ts';
import { ATTACH_PHOTOS_MCP_SPEC } from './attach-photos-mcp-spec.ts';
import { MCP_SERVER_IDENTITY } from './mcp-server-identity.ts';
import { saveRecordFromText } from './save-record-from-text.ts';
import { SAVE_RECORD_FROM_TEXT_MCP_SPEC } from './save-record-from-text-mcp-spec.ts';

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const CHANGE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const READ_TOOL_SPECS = [SEARCH_RECORDS_SPEC, COUNT_RECORDS_SPEC, LIST_MEMBERS_SPEC, MAINTENANCE_STATUS_SPEC, LIST_SCHEDULED_TASKS_SPEC];
const CHANGE_TOOL_SPECS = [CREATE_INVITE_SPEC, REMOVE_MEMBER_SPEC, CREATE_SCHEDULED_TASK_SPEC, CANCEL_SCHEDULED_TASK_SPEC];
const failedOutputSchema = z.object({ ok: z.literal(false) });

export type McpRuntime = { database: Database; clock: Clock; photoStorage: PhotoStorage | null; reader: ReaderService | null };

export function describeMcpServer(runtime: McpRuntime, scope: AccessScope): McpServerDefinition {
  const readTools = READ_TOOL_SPECS.map((spec) => describeAdminTool(runtime, scope, spec, READ_ONLY_ANNOTATIONS));
  const photoTools = runtime.photoStorage === null ? [] : [describeAdminTool(runtime, scope, ATTACH_PHOTOS_MCP_SPEC, READ_ONLY_ANNOTATIONS)];
  const changeTools = CHANGE_TOOL_SPECS.map((spec) => describeAdminTool(runtime, scope, spec, CHANGE_ANNOTATIONS));
  return { ...MCP_SERVER_IDENTITY, tools: [...readTools, ...photoTools, ...changeTools, ...describeSaveRecordTools(runtime, scope)] };
}

function describeSaveRecordTools({ database, clock, reader }: McpRuntime, scope: AccessScope): McpTool[] {
  if (reader === null) return [];
  const call = (args: unknown) => saveRecordFromText({ database, clock, reader }, scope, args);
  return [describeTool(SAVE_RECORD_FROM_TEXT_MCP_SPEC, CHANGE_ANNOTATIONS, call)];
}

function describeAdminTool(runtime: McpRuntime, scope: AccessScope, spec: ToolSpec, annotations: McpToolAnnotations): McpTool {
  return describeTool(spec, annotations, (args) => callAdminTool(runtime, scope, spec.name, args));
}

function describeTool({ name, description, parameters }: ToolSpec, annotations: McpToolAnnotations, call: McpTool['call']): McpTool {
  return { name, description, inputSchema: parameters, annotations, securitySchemes: [{ type: 'oauth2' }], call };
}

async function callAdminTool(runtime: McpRuntime, scope: AccessScope, name: string, args: unknown): Promise<McpToolResult> {
  const call = { id: randomUUID(), name, argumentsJson: JSON.stringify(args) };
  const attachments = new PhotoAttachments();
  const text = await runAdminTool(buildAdminToolDependencies(runtime, attachments), scope, call);
  const images = await readAttachedPhotos(runtime.photoStorage, attachments);
  return { text, isError: failedOutputSchema.safeParse(JSON.parse(text)).success, images };
}

async function readAttachedPhotos(photoStorage: PhotoStorage | null, attachments: PhotoAttachments): Promise<Photo[]> {
  if (photoStorage === null) return [];
  const photos = await Promise.all(attachments.list().map(({ imageKey }) => photoStorage.get(imageKey)));
  return photos.filter((photo) => photo !== null);
}

function buildAdminToolDependencies({ database, clock }: McpRuntime, attachments: PhotoAttachments): AdminToolDependencies {
  return {
    database,
    clock,
    attachments,
    sources: new SourceCards(),
    created: new CreatedTasks(randomUUID()),
    invites: new CreatedInvites(),
    nameReview: new NameReviewRequest(),
    guard: new AdminTextGuard(false),
  };
}
