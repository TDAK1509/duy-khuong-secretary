import type { Transaction } from '../db/transaction.ts';
import { hasDuplicateRecord } from '../records/has-duplicate-record.ts';
import { insertRecords } from '../records/insert-records.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import type { IntakeContext } from './intake-context.ts';
import { notifyAdminsOfPhoto } from './notify-admins-of-photo.ts';
import { placeUnclearPhoto } from './place-unclear-photo.ts';
import { planDuplicateReply, type ReplyPlan } from './plan-reply.ts';
import type { MessageToRead } from './reply-to-message.ts';
import { markQuestionPending, setSubmissionStatus, storeBotReply } from './store-user-message.ts';

export async function runReplyStage(context: IntakeContext, message: MessageToRead, plan: ReplyPlan): Promise<void> {
  await context.stages.runStage({
    isDone: (transaction) => isReplied(transaction, message.id),
    write: (transaction) => saveReply(transaction, context, message, plan),
  });
}

export async function isReplied(transaction: Transaction, messageId: string): Promise<boolean> {
  const rows = await transaction.query(
    `SELECT 1 FROM messages
     WHERE id = $1 AND (submission_status <> 'pending' OR EXISTS (SELECT 1 FROM messages reply WHERE reply.reply_to = $1))`,
    [messageId],
  );
  return rows.length > 0;
}

async function saveReply(
  transaction: Transaction,
  context: IntakeContext,
  { id: messageId, photo }: MessageToRead,
  plannedReply: ReplyPlan,
): Promise<void> {
  if (isPhotoQuestion(plannedReply)) return placeUnclearPhoto(transaction, context, messageId, plannedReply);
  const { sender } = context;
  const plan = await rejectDuplicates(transaction, sender.workspaceId, plannedReply);
  const message = { id: messageId, workspaceId: sender.workspaceId, userId: sender.userId };
  if (plan.saved) await insertRecords(transaction, message, plan.saved);
  await storeBotReply(transaction, messageId, { text: plan.replyText, kind: plan.replyKind });
  await setSubmissionStatus(transaction, messageId, plan.status);
  await enqueueReplyToMessage(transaction, context, messageId, plan.replyText);
  await notifyAdminsOfPhoto(transaction, context, messageId, plan.replyText);
  if (plan.saved && plan.asksQuestion && sender.role === 'admin' && photo === null) await markQuestionPending(transaction, messageId);
}

function isPhotoQuestion({ situation }: ReplyPlan): boolean {
  return situation === 'needs_explanation';
}

export async function rejectDuplicates(transaction: Transaction, workspaceId: string, plan: ReplyPlan): Promise<ReplyPlan> {
  if (!plan.saved) return plan;
  await lockWorkspaceRecords(transaction, workspaceId);
  if (!(await hasDuplicateRecord(transaction, workspaceId, plan.saved))) return plan;
  return planDuplicateReply();
}
