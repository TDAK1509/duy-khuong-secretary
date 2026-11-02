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
import { findDueRecords } from './find-due-records.ts';
import { findTaskCreator, type TaskCreator } from './find-task-creator.ts';
import { finishScheduledRun } from './finish-scheduled-run.ts';
import { runScheduledTool, SCHEDULED_RUN_TOOLS } from './scheduled-tools.ts';
import { describeFailedRun, NOTHING_TO_REPORT } from './scheduled-run-texts.ts';
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
  const text = await produceResultText(dependencies, task, creator);
  await finishScheduledRun(dependencies, task, creator, text);
}

async function produceResultText(dependencies: ScheduledRunDependencies, task: ClaimedTask, creator: TaskCreator): Promise<string> {
  if (task.maintenanceRules.length === 0) return askModel(dependencies, task, creator, task.instruction);
  const dueRecords = await findDueRecords(dependencies.database, task, dependencies.clock.now());
  if (dueRecords.length === 0) return NOTHING_TO_REPORT;
  return askModel(dependencies, task, creator, buildDueRecordsTurn(task.instruction, dueRecords));
}

async function askModel(
  { database, clock, chat }: ScheduledRunDependencies,
  task: ClaimedTask,
  creator: TaskCreator,
  userTurn: string,
): Promise<string> {
  const caller: AccessScope = { workspaceId: task.workspaceId, userId: task.createdBy, role: 'admin' };
  const toolDependencies = { database, clock, attachments: new PhotoAttachments(), drafts: new DraftProposals() };
  const outcome = await runToolLoop(chat, buildRunRequest(task, creator, clock.now(), userTurn), (call) =>
    runScheduledTool(toolDependencies, caller, call),
  );
  return outcome.ok ? outcome.text : describeFailedRun(task.title);
}

function buildRunRequest(task: ClaimedTask, creator: TaskCreator, now: Date, userTurn: string): ChatRequest {
  const facts = { workspaceName: creator.workspaceName, taskTitle: task.title, creatorName: creator.displayName, now };
  return {
    system: buildScheduledRunPrompt(facts),
    turns: [{ role: 'user', text: userTurn, image: null }],
    tools: SCHEDULED_RUN_TOOLS,
  };
}
