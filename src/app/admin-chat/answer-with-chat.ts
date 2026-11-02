import type { ChatService } from '../../services/chat/chat-service.ts';
import { isCurrentAdmin } from '../access/is-current-admin.ts';
import type { AccessScope } from '../access/access-scope.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueReply, enqueueReplyPhotos } from '../intake/enqueue-reply.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import type { MessageToRead } from '../intake/reply-to-message.ts';
import { clearQuestionPending, setSubmissionStatus, storeBotReply, storeReplyPhotos } from '../intake/store-user-message.ts';
import { ADMIN_TOOLS } from './tools/admin-tools.ts';
import { runToolLoop } from './run-tool-loop.ts';
import { runAdminTool } from './tools/run-admin-tool.ts';
import { buildAdminPrompt } from './admin-prompt.ts';
import { buildUserTurn } from './build-user-turn.ts';
import { loadAdminProfile, type AdminProfile } from './load-admin-profile.ts';
import { loadHistoryTurns } from './load-history-turns.ts';
import type { AttachablePhoto } from '../records/find-record-photos.ts';
import { PhotoAttachments } from './photo-attachments.ts';
import { CreatedTasks } from './created-tasks.ts';
import { loadTaskSummaries } from '../schedules/load-task-summaries.ts';

export async function answerWithChat(context: IntakeContext, message: MessageToRead): Promise<void> {
  const profile = await loadAdminProfile(context.dependencies.database, context.sender.membershipId);
  if (profile === null) return;
  const answer = await produceAnswer(context, message, profile);
  await context.stages.runStage({
    isDone: (transaction) => hasAnswer(transaction, message.id),
    write: (transaction) => publishAnswer(transaction, context, message.id, answer),
  });
}

type Answer = { text: string; photos: AttachablePhoto[]; createdTaskIds: string[] };

async function produceAnswer(context: IntakeContext, message: MessageToRead, profile: AdminProfile): Promise<Answer> {
  const { database, clock } = context.dependencies;
  const history = await loadHistoryTurns(database, context.sender, profile.joinedAt, message.id);
  const request = {
    system: buildAdminPrompt({ ...profile, now: clock.now() }),
    turns: [...history, await buildUserTurn(database, message)],
    tools: ADMIN_TOOLS,
  };
  const caller: AccessScope = { workspaceId: context.sender.workspaceId, userId: context.sender.userId, role: 'admin' };
  const dependencies = { database, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(message.id) };
  const outcome = await runToolLoop(requireChat(context), request, (call) => runAdminTool(dependencies, caller, call));
  return { text: outcome.text, photos: dependencies.attachments.list(), createdTaskIds: dependencies.created.listTaskIds() };
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
  const text = [answer.text, ...summaries].join('\n\n');
  await storeBotReply(transaction, messageId, { text, kind: 'answer' });
  await storeReplyPhotos(transaction, messageId, answer.photos);
  await clearQuestionPending(transaction, messageId);
  await setSubmissionStatus(transaction, messageId, 'accepted');
  await enqueueReply(transaction, context, text, sender.membershipId);
  await enqueueReplyPhotos(transaction, context, answer.photos, sender.membershipId);
}
