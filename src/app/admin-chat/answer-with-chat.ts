import type { ChatRequest, ChatService } from '../../services/chat/chat-service.ts';
import { isCurrentAdmin } from '../access/is-current-admin.ts';
import type { AccessScope } from '../access/access-scope.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueReply, enqueueReplyPhotos } from '../intake/enqueue-reply.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import { clearQuestionPending, setSubmissionStatus, storeBotReply, storeReplyPhotos } from '../intake/store-user-message.ts';
import { ADMIN_TOOLS } from './tools/admin-tools.ts';
import { runToolLoop, type LoggedRound, type RunTool, type ToolLoopResult } from './run-tool-loop.ts';
import { formatAdminChatLine } from './format-admin-chat-line.ts';
import { runAdminTool } from './tools/run-admin-tool.ts';
import { buildAdminPrompt } from './admin-prompt.ts';
import { buildUserTurn } from './build-user-turn.ts';
import type { ChatMessage } from './chat-message.ts';
import { hasNoteFromPhoto } from './has-note-from-photo.ts';
import { loadAdminProfile, type AdminProfile } from './load-admin-profile.ts';
import { loadHistoryTurns } from './load-history-turns.ts';
import type { AttachablePhoto } from '../records/find-record-photos.ts';
import { PhotoAttachments } from './photo-attachments.ts';
import { CreatedInvites } from './created-invites.ts';
import { CreatedTasks } from './created-tasks.ts';
import { AdminTextGuard } from './tools/admin-text-guard.ts';
import { CHANGE_REFUSED_NOTICE } from './chat-texts.ts';
import { loadTaskSummaries } from '../schedules/load-task-summaries.ts';

export async function answerWithChat(context: IntakeContext, message: ChatMessage): Promise<void> {
  const profile = await loadAdminProfile(context.dependencies.database, context.sender.membershipId);
  if (profile === null) return;
  const answer = await produceAnswer(context, message, profile);
  await context.stages.runStage({
    isDone: (transaction) => hasAnswer(transaction, message.id),
    write: (transaction) => publishAnswer(transaction, context, message.id, answer),
  });
}

type Answer = { text: string; photos: AttachablePhoto[]; createdTaskIds: string[]; inviteCodes: string[]; changeRefused: boolean };

async function produceAnswer(context: IntakeContext, message: ChatMessage, profile: AdminProfile): Promise<Answer> {
  const { database, clock } = context.dependencies;
  const request = await buildChatRequest(context, message, profile);
  const caller: AccessScope = { workspaceId: context.sender.workspaceId, userId: context.sender.userId, role: 'admin' };
  const guard = new AdminTextGuard(await hasNoteFromPhoto(database, message.id));
  const dependencies = { database, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(message.id), invites: new CreatedInvites(), guard };
  const result = await runLoggedToolLoop(context, message, request, (call) => runAdminTool(dependencies, caller, call));
  const { attachments, created, invites } = dependencies;
  return {
    text: result.text,
    photos: attachments.list(),
    createdTaskIds: created.listTaskIds(),
    inviteCodes: invites.listCodes(),
    changeRefused: guard.hasRefused(),
  };
}

async function runLoggedToolLoop(context: IntakeContext, message: ChatMessage, request: ChatRequest, runTool: RunTool): Promise<ToolLoopResult> {
  const rounds: LoggedRound[] = [];
  const result = await runToolLoop(requireChat(context), request, runTool, rounds);
  console.log(formatAdminChatLine(message.id, result.outcome, rounds));
  return result;
}

async function buildChatRequest(context: IntakeContext, message: ChatMessage, profile: AdminProfile): Promise<ChatRequest> {
  const { database, clock } = context.dependencies;
  const history = await loadHistoryTurns(database, context.sender, profile.joinedAt, message.id);
  return {
    system: buildAdminPrompt({ ...profile, now: clock.now() }),
    turns: [...history, await buildUserTurn(database, message)],
    tools: ADMIN_TOOLS,
  };
}

function requireChat(context: IntakeContext): ChatService {
  const { chat } = context.dependencies;
  if (chat === null) throw new Error('the chat service is not configured');
  return chat;
}

async function hasAnswer(transaction: Transaction, messageId: string): Promise<boolean> {
  const rows = await transaction.query(`SELECT 1 FROM messages WHERE reply_to = $1 AND reply_kind = 'answer'`, [messageId]);
  return rows.length > 0;
}

async function publishAnswer(transaction: Transaction, context: IntakeContext, messageId: string, answer: Answer): Promise<void> {
  const { sender } = context;
  if (!(await isCurrentAdmin(transaction, sender.membershipId))) return;
  const summaries = await loadTaskSummaries(transaction, answer.createdTaskIds, sender);
  const text = joinAnswerParts(answer, summaries);
  await storeBotReply(transaction, messageId, { text, kind: 'answer' });
  await storeReplyPhotos(transaction, messageId, answer.photos);
  await clearQuestionPending(transaction, messageId);
  await setSubmissionStatus(transaction, messageId, 'accepted');
  await enqueueReply(transaction, context, text, { adminMembershipId: sender.membershipId });
  for (const code of answer.inviteCodes) await enqueueReply(transaction, context, code, { adminMembershipId: sender.membershipId });
  await enqueueReplyPhotos(transaction, context, answer.photos, sender.membershipId);
}

function joinAnswerParts(answer: Answer, summaries: string[]): string {
  const notice = answer.changeRefused ? [CHANGE_REFUSED_NOTICE] : [];
  return [answer.text, ...summaries, ...notice].join('\n\n');
}
