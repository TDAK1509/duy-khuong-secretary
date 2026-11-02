import type { ChatService } from '../../services/chat/chat-service.ts';
import type { AccessScope } from '../access/access-scope.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueReply } from '../intake/enqueue-reply.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import type { MessageToRead } from '../intake/reply-to-message.ts';
import { clearQuestionPending, setSubmissionStatus, storeBotReply } from '../intake/store-user-message.ts';
import { ADMIN_TOOLS } from './tools/admin-tools.ts';
import { runToolLoop } from './run-tool-loop.ts';
import { runAdminTool } from './tools/run-admin-tool.ts';
import { buildAdminPrompt } from './admin-prompt.ts';
import { buildUserTurn } from './build-user-turn.ts';
import { loadAdminProfile, type AdminProfile } from './load-admin-profile.ts';
import { loadHistoryTurns } from './load-history-turns.ts';

export async function answerWithChat(context: IntakeContext, message: MessageToRead): Promise<void> {
  const profile = await loadAdminProfile(context.dependencies.database, context.sender.membershipId);
  if (profile === null) return;
  const answer = await produceAnswer(context, message, profile);
  await context.stages.runStage({
    isDone: (transaction) => hasAnswer(transaction, message.id),
    write: (transaction) => publishAnswer(transaction, context, message.id, answer),
  });
}

async function produceAnswer(context: IntakeContext, message: MessageToRead, profile: AdminProfile): Promise<string> {
  const { database, clock } = context.dependencies;
  const history = await loadHistoryTurns(database, context.sender, profile.joinedAt, message.id);
  const request = {
    system: buildAdminPrompt({ ...profile, now: clock.now() }),
    turns: [...history, await buildUserTurn(database, message)],
    tools: ADMIN_TOOLS,
  };
  const caller: AccessScope = { workspaceId: context.sender.workspaceId, userId: context.sender.userId, role: 'admin' };
  return runToolLoop(requireChat(context), request, (call) => runAdminTool(database, caller, call));
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

async function publishAnswer(transaction: Transaction, context: IntakeContext, messageId: string, answer: string): Promise<void> {
  const { sender } = context;
  if (!(await isStillSameAdmin(transaction, sender.membershipId))) return;
  await storeBotReply(transaction, messageId, { text: answer, kind: 'answer' });
  await clearQuestionPending(transaction, messageId);
  await setSubmissionStatus(transaction, messageId, 'accepted');
  await enqueueReply(transaction, context, answer, sender.membershipId);
}

async function isStillSameAdmin(transaction: Transaction, membershipId: string): Promise<boolean> {
  const rows = await transaction.query(`SELECT 1 FROM memberships WHERE id = $1 AND role = 'admin' FOR SHARE`, [membershipId]);
  return rows.length > 0;
}
