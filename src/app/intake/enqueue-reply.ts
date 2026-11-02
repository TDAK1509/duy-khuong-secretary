import { enqueueText } from '../delivery/enqueue-text.ts';
import type { Transaction } from '../db/transaction.ts';
import type { IntakeContext } from './intake-context.ts';

export async function enqueueReply(
  transaction: Transaction,
  context: IntakeContext,
  text: string,
  adminMembershipId?: string,
): Promise<void> {
  const { event, dependencies } = context;
  await enqueueText(transaction, {
    to: { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId },
    text,
    maxTextLength: dependencies.channel.maxTextLength,
    availableAt: dependencies.clock.now(),
    ...(adminMembershipId !== undefined && { adminMembershipId }),
  });
}
