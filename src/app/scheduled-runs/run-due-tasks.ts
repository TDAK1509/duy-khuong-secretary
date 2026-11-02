import type { ChatRequest, ChatService } from '../../services/chat/chat-service.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { AccessScope } from '../access/access-scope.ts';
import { DraftProposals } from '../admin-chat/draft-proposals.ts';
import { PhotoAttachments } from '../admin-chat/photo-attachments.ts';
import { runToolLoop } from '../admin-chat/run-tool-loop.ts';
import type { Database } from '../db/transaction.ts';
import { claimDueTask, type ClaimedTask } from './claim-due-task.ts';
import { findTaskCreator, type TaskCreator } from './find-task-creator.ts';
import { finishScheduledRun } from './finish-scheduled-run.ts';
import { runScheduledTool, SCHEDULED_RUN_TOOLS } from './scheduled-tools.ts';
import { describeFailedRun } from './scheduled-run-texts.ts';
import { turnOffTask } from './turn-off-task.ts';
import { buildScheduledRunPrompt } from './scheduled-run-prompt.ts';

const MAX_TASKS_PER_TICK = 5;

export type ScheduledRunDependencies = {
  database: Database;
  clock: Clock;
  chat: ChatService;
  channel: MessagingChannel;
};

export async function runDueTasks(dependencies: ScheduledRunDependencies): Promise<void> {
  for (let started = 0; started < MAX_TASKS_PER_TICK; started += 1) {
    const task = await claimDueTask(dependencies.database, dependencies.clock.now());
    if (task === null) return;
    await runClaimedTask(dependencies, task);
  }
}

async function runClaimedTask(dependencies: ScheduledRunDependencies, task: ClaimedTask): Promise<void> {
  const creator = await findTaskCreator(dependencies.database, task);
  if (creator === null) return turnOffTask(dependencies.database, task);
  const text = await produceResultText(dependencies, task, creator);
  await finishScheduledRun(dependencies, task, creator, text);
}

async function produceResultText(
  { database, clock, chat }: ScheduledRunDependencies,
  task: ClaimedTask,
  creator: TaskCreator,
): Promise<string> {
  const caller: AccessScope = { workspaceId: task.workspaceId, userId: task.createdBy, role: 'admin' };
  const toolDependencies = { database, clock, attachments: new PhotoAttachments(), drafts: new DraftProposals() };
  const outcome = await runToolLoop(chat, buildRunRequest(task, creator, clock.now()), (call) =>
    runScheduledTool(toolDependencies, caller, call),
  );
  return outcome.ok ? outcome.text : describeFailedRun(task.title);
}

function buildRunRequest(task: ClaimedTask, creator: TaskCreator, now: Date): ChatRequest {
  const facts = { workspaceName: creator.workspaceName, taskTitle: task.title, creatorName: creator.displayName, now };
  return {
    system: buildScheduledRunPrompt(facts),
    turns: [{ role: 'user', text: task.instruction, image: null }],
    tools: SCHEDULED_RUN_TOOLS,
  };
}
