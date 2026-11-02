import { enqueueText } from '../delivery/enqueue-text.ts';
import type { Transaction } from '../db/transaction.ts';
import { insertRecords } from '../records/insert-records.ts';
import type { IntakeContext } from './intake-context.ts';
import type { ReplyPlan } from './plan-reply.ts';
import { storeBotReply } from './store-user-message.ts';

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
  plan: ReplyPlan,
): Promise<void> {
  const { event, sender, dependencies } = context;
  const message = { id: messageId, workspaceId: sender.workspaceId, userId: sender.userId };
  await insertRecords(transaction, message, plan.readBy, plan.records);
  await storeBotReply(transaction, messageId, plan.replyText);
  await enqueueText(transaction, {
    to: { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId },
    text: plan.replyText,
    maxTextLength: dependencies.channel.maxTextLength,
    availableAt: dependencies.clock.now(),
  });
}
