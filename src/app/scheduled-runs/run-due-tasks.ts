import type { ChatService } from '../../services/chat/chat-service.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { AccessScope } from '../access/access-scope.ts';
import { DraftProposals } from '../admin-chat/draft-proposals.ts';
import { PhotoAttachments } from '../admin-chat/photo-attachments.ts';
import { runToolLoop } from '../admin-chat/run-tool-loop.ts';
import { runAdminTool } from '../admin-chat/tools/run-admin-tool.ts';
import type { Database } from '../db/transaction.ts';
import { claimDueTask, type ClaimedTask } from './claim-due-task.ts';
import { finishScheduledRun } from './finish-scheduled-run.ts';

export type ScheduledRunDependencies = {
  database: Database;
  clock: Clock;
  chat: ChatService;
  channel: MessagingChannel;
};

export async function runDueTasks(dependencies: ScheduledRunDependencies): Promise<void> {
  const { database, clock } = dependencies;
  for (let task = await claimDueTask(database, clock.now()); task; task = await claimDueTask(database, clock.now())) {
    await runClaimedTask(dependencies, task);
  }
}

async function runClaimedTask(dependencies: ScheduledRunDependencies, task: ClaimedTask): Promise<void> {
  const text = await produceResultText(dependencies, task);
  await finishScheduledRun(dependencies, task, text);
}

async function produceResultText({ database, clock, chat }: ScheduledRunDependencies, task: ClaimedTask): Promise<string> {
  const caller: AccessScope = { workspaceId: task.workspaceId, userId: task.createdBy, role: 'admin' };
  const toolDependencies = { database, clock, attachments: new PhotoAttachments(), drafts: new DraftProposals() };
  const request = { system: '', turns: [{ role: 'user' as const, text: task.instruction, image: null }], tools: [] };
  return runToolLoop(chat, request, (call) => runAdminTool(toolDependencies, caller, call));
}
