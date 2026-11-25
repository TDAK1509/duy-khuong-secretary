import type { ChatRequest, ChatService } from '../../../services/chat/chat-service.ts';
import type { Clock } from '../../../services/clock/clock.ts';
import type { MessagingChannel } from '../../../services/messaging/messaging-channel.ts';
import type { AccessScope } from '../../access/access-scope.ts';
import { CreatedInvites } from '../../admin-chat/created-invites.ts';
import { CreatedTasks } from '../../admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../admin-chat/photo-attachments.ts';
import { SourceCards } from '../../admin-chat/source-cards.ts';
import { runToolLoop } from '../../admin-chat/run-tool-loop.ts';
import { hasCredits } from '../../credits/has-credits.ts';
import { meterChat } from '../../credits/meter-chat.ts';
import type { Database } from '../../db/transaction.ts';
import { claimDueTask, type ClaimedTask } from './claim-due-task.ts';
import type { HeldTasks } from './held-tasks.ts';
import { findTaskCreator, type TaskCreator } from './find-task-creator.ts';
import { finishScheduledRun } from './finish-scheduled-run.ts';
import { runScheduledTool, SCHEDULED_RUN_TOOLS } from './scheduled-tools.ts';
import { describeFailedRun, describeSkippedRun, labelAnswer } from './scheduled-run-texts.ts';
import { turnOffTask } from './turn-off-task.ts';
import { buildScheduledRunPrompt, buildScheduledRunTurn } from './scheduled-run-prompt.ts';
import { WaitingChanges } from '../../admin-chat/changes/waiting-changes.ts';
import { AdminTextGuard } from '../../admin-chat/tools/admin-text-guard.ts';

const MAX_TASKS_PER_TICK = 5;

export type ScheduledRunDependencies = {
  database: Database;
  clock: Clock;
  chat: ChatService;
  channel: MessagingChannel;
  held: HeldTasks;
  shutdown: AbortSignal;
};

export async function runDueTasks(dependencies: ScheduledRunDependencies): Promise<void> {
  for (let started = 0; started < MAX_TASKS_PER_TICK && !dependencies.shutdown.aborted; started += 1) {
    const task = await claimDueTask(dependencies.database, dependencies.clock.now());
    if (task === null) return;
    await runHeldTask(dependencies, task);
  }
}

async function runHeldTask(dependencies: ScheduledRunDependencies, task: ClaimedTask): Promise<void> {
  dependencies.held.add(task);
  console.log(`[scheduled-run] started task=${task.id}`);
  try {
    if (await runClaimedTask(dependencies, task)) console.log(`[scheduled-run] finished task=${task.id}`);
  } finally {
    dependencies.held.remove(task.id);
  }
}

async function runClaimedTask(dependencies: ScheduledRunDependencies, task: ClaimedTask): Promise<boolean> {
  const creator = await findTaskCreator(dependencies.database, task);
  if (creator === null) {
    await turnOffTask(dependencies.database, task);
    return false;
  }
  const text = await produceResult(dependencies, task, creator);
  return finishScheduledRun(dependencies, task, creator, text);
}

async function produceResult(dependencies: ScheduledRunDependencies, task: ClaimedTask, creator: TaskCreator): Promise<string> {
  if (!(await hasCredits(dependencies.database, task.workspaceId))) return describeSkippedRun(task.title);
  return runModel(dependencies, task, creator);
}

async function runModel(
  { database, clock, chat, channel }: ScheduledRunDependencies,
  task: ClaimedTask,
  creator: TaskCreator,
): Promise<string> {
  const caller: AccessScope = { workspaceId: task.workspaceId, userId: task.createdBy, role: 'admin' };
  const toolDependencies = { database, clock, attachments: new PhotoAttachments(), sources: new SourceCards(), created: new CreatedTasks(null), invites: new CreatedInvites(), guard: new AdminTextGuard(true), waiting: new WaitingChanges() };
  const meteredChat = meterChat(chat, { database, workspaceId: task.workspaceId, charged: { clock, maxTextLength: channel.maxTextLength } }, 'scheduled_run');
  const result = await runToolLoop(meteredChat, buildRunRequest(task, creator, clock.now()), (call) =>
    runScheduledTool(toolDependencies, caller, call),
  );
  if (result.outcome !== 'answered' || result.text.trim() === '') return describeFailedRun(task.title);
  return labelAnswer(task.title, result.text);
}

function buildRunRequest(task: ClaimedTask, creator: TaskCreator, now: Date): ChatRequest {
  const facts = { workspaceName: creator.workspaceName, taskTitle: task.title, creatorName: creator.displayName };
  return {
    system: buildScheduledRunPrompt(now),
    turns: [{ role: 'user', text: buildScheduledRunTurn(facts, task.instruction) }],
    tools: SCHEDULED_RUN_TOOLS,
  };
}
