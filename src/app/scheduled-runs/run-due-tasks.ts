import type { ChatRequest, ChatService } from '../../services/chat/chat-service.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { AccessScope } from '../access/access-scope.ts';
import { CreatedInvites } from '../admin-chat/created-invites.ts';
import { CreatedTasks } from '../admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../admin-chat/photo-attachments.ts';
import { SourceCards } from '../admin-chat/source-cards.ts';
import { runToolLoop } from '../admin-chat/run-tool-loop.ts';
import type { Database } from '../db/transaction.ts';
import { claimDueTask, type ClaimedTask } from './claim-due-task.ts';
import { buildDueRecordsTurn } from './due-records-turn.ts';
import { findDueRecords, type DueRecord } from './find-due-records.ts';
import { findTaskCreator, type TaskCreator } from './find-task-creator.ts';
import { finishScheduledRun } from './finish-scheduled-run.ts';
import type { ScheduledRunResult } from './scheduled-run-result.ts';
import { runScheduledTool, SCHEDULED_RUN_TOOLS } from './scheduled-tools.ts';
import { describeFailedRun, NOTHING_TO_REPORT } from './scheduled-run-texts.ts';
import { turnOffTask } from './turn-off-task.ts';
import { buildScheduledRunPrompt } from './scheduled-run-prompt.ts';
import { AdminTextGuard } from '../admin-chat/tools/admin-text-guard.ts';

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
  const result = await produceResult(dependencies, task, creator);
  await finishScheduledRun(dependencies, task, creator, result);
}

async function produceResult(dependencies: ScheduledRunDependencies, task: ClaimedTask, creator: TaskCreator): Promise<ScheduledRunResult> {
  if (task.maintenanceRules.length === 0) return askModel(dependencies, task, creator, { userTurn: task.instruction, dueRecords: [] });
  const dueRecords = await findDueRecords(dependencies.database, task, dependencies.clock.now());
  if (dueRecords.length === 0) return { text: NOTHING_TO_REPORT, remindedRecordIds: [] };
  return askModel(dependencies, task, creator, { userTurn: buildDueRecordsTurn(task.instruction, dueRecords), dueRecords });
}

async function askModel(
  { database, clock, chat }: ScheduledRunDependencies,
  task: ClaimedTask,
  creator: TaskCreator,
  { userTurn, dueRecords }: { userTurn: string; dueRecords: DueRecord[] },
): Promise<ScheduledRunResult> {
  const caller: AccessScope = { workspaceId: task.workspaceId, userId: task.createdBy, role: 'admin' };
  const toolDependencies = { database, clock, attachments: new PhotoAttachments(), sources: new SourceCards(), created: new CreatedTasks(null), invites: new CreatedInvites(), guard: new AdminTextGuard(true) };
  const result = await runToolLoop(chat, buildRunRequest(task, creator, clock.now(), userTurn), (call) =>
    runScheduledTool(toolDependencies, caller, call),
  );
  if (result.outcome !== 'answered' || result.text.trim() === '') return { text: describeFailedRun(task.title), remindedRecordIds: [] };
  return { text: result.text, remindedRecordIds: dueRecords.map((record) => record.record_id) };
}

function buildRunRequest(task: ClaimedTask, creator: TaskCreator, now: Date, userTurn: string): ChatRequest {
  const facts = { workspaceName: creator.workspaceName, taskTitle: task.title, creatorName: creator.displayName, now };
  return {
    system: buildScheduledRunPrompt(facts),
    turns: [{ role: 'user', text: userTurn }],
    tools: SCHEDULED_RUN_TOOLS,
  };
}
