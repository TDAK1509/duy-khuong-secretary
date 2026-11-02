import type { ChatRequest, ChatService } from '../../services/chat/chat-service.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { AccessScope } from '../access/access-scope.ts';
import { DraftProposals } from '../admin-chat/draft-proposals.ts';
import { PhotoAttachments } from '../admin-chat/photo-attachments.ts';
import { runToolLoop } from '../admin-chat/run-tool-loop.ts';
import type { Database } from '../db/transaction.ts';
import { claimDueTask, type ClaimedTask } from './claim-due-task.ts';
import { buildDueRecordsTurn } from './due-records-turn.ts';
import { findDueRecords, type DueRecord } from './find-due-records.ts';
import { findTaskCreator, type TaskCreator } from './find-task-creator.ts';
import { finishScheduledRun } from './finish-scheduled-run.ts';
import { runScheduledTool, SCHEDULED_RUN_TOOLS } from './scheduled-tools.ts';
import { describeFailedRun } from './scheduled-run-texts.ts';
import { turnOffTask } from './turn-off-task.ts';
import { buildScheduledRunPrompt } from './scheduled-run-prompt.ts';

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
  const creator = await findTaskCreator(dependencies.database, task);
  if (creator === null) return turnOffTask(dependencies.database, task);
  const dueRecords = await findDueRecords(dependencies.database, task, dependencies.clock.now());
  const text = await produceResultText(dependencies, task, creator, dueRecords);
  await finishScheduledRun(dependencies, task, creator, text);
}

async function produceResultText(
  { database, clock, chat }: ScheduledRunDependencies,
  task: ClaimedTask,
  creator: TaskCreator,
  dueRecords: DueRecord[],
): Promise<string> {
  const caller: AccessScope = { workspaceId: task.workspaceId, userId: task.createdBy, role: 'admin' };
  const toolDependencies = { database, clock, attachments: new PhotoAttachments(), drafts: new DraftProposals() };
  const outcome = await runToolLoop(chat, buildRunRequest(task, creator, clock.now(), dueRecords), (call) =>
    runScheduledTool(toolDependencies, caller, call),
  );
  return outcome.ok ? outcome.text : describeFailedRun(task.title);
}

function buildRunRequest(task: ClaimedTask, creator: TaskCreator, now: Date, dueRecords: DueRecord[]): ChatRequest {
  const facts = { workspaceName: creator.workspaceName, taskTitle: task.title, creatorName: creator.displayName, now };
  return {
    system: buildScheduledRunPrompt(facts),
    turns: [{ role: 'user', text: buildUserTurn(task, dueRecords), image: null }],
    tools: SCHEDULED_RUN_TOOLS,
  };
}

function buildUserTurn(task: ClaimedTask, dueRecords: DueRecord[]): string {
  return task.maintenanceRules.length === 0 ? task.instruction : buildDueRecordsTurn(task.instruction, dueRecords);
}
