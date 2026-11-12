import type { Transaction } from '../db/transaction.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import type { IntakeContext } from './intake-context.ts';
import { ASK_EXPLANATION_TEXT } from './intake-texts.ts';
import { storeBotReply } from './store-user-message.ts';
import { findOldestWaitingPhoto } from './waiting-photos.ts';

export async function askNextWaitingPhoto(transaction: Transaction, context: IntakeContext): Promise<void> {
  const next = await findOldestWaitingPhoto(transaction, context.sender);
  if (next === null) return;
  await storeBotReply(transaction, next.id, { text: ASK_EXPLANATION_TEXT, kind: 'answer', holdsOtherText: false });
  await enqueueReplyToMessage(transaction, context, next.id, ASK_EXPLANATION_TEXT);
}
