import type { Transaction } from '../db/transaction.ts';
import { hasDuplicateRecord } from '../records/has-duplicate-record.ts';
import { insertRecords } from '../records/insert-records.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { enqueueReply } from './enqueue-reply.ts';
import type { IntakeContext } from './intake-context.ts';
import { planDuplicateReply, type ReplyPlan } from './plan-reply.ts';
import { setSubmissionStatus, storeBotReply } from './store-user-message.ts';

export async function runReplyStage(context: IntakeContext, messageId: string, plan: ReplyPlan): Promise<void> {
  await context.stages.runStage({
    isDone: (transaction) => hasReply(transaction, messageId),
    write: (transaction) => saveReply(transaction, context, messageId, plan),
  });
}

async function hasReply(transaction: Transaction, messageId: string): Promise<boolean> {
  const rows = await transaction.query('SELECT 1 FROM messages WHERE reply_to = $1', [messageId]);
  return rows.length > 0;
}

async function saveReply(
  transaction: Transaction,
  context: IntakeContext,
  messageId: string,
  plannedReply: ReplyPlan,
): Promise<void> {
  const { sender } = context;
  const plan = await rejectDuplicates(transaction, sender.workspaceId, plannedReply);
  const message = { id: messageId, workspaceId: sender.workspaceId, userId: sender.userId };
  if (plan.saved) await insertRecords(transaction, message, plan.saved.readBy, plan.saved.records);
  await storeBotReply(transaction, messageId, { text: plan.replyText, kind: plan.replyKind });
  await setSubmissionStatus(transaction, messageId, plan.status);
  await enqueueReply(transaction, context, plan.replyText);
}

async function rejectDuplicates(transaction: Transaction, workspaceId: string, plan: ReplyPlan): Promise<ReplyPlan> {
  if (!plan.saved) return plan;
  await lockWorkspaceRecords(transaction, workspaceId);
  if (!(await hasDuplicateRecord(transaction, workspaceId, plan.saved.records))) return plan;
  return planDuplicateReply();
}
