import type { Transaction } from '../db/transaction.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import type { IntakeContext } from './intake-context.ts';
import { chooseAskText } from './intake-texts.ts';
import { storeBotReply } from './store-user-message.ts';
import { findOldestWaitingPhoto } from './waiting-photos.ts';

export async function askNextWaitingPhoto(transaction: Transaction, context: IntakeContext): Promise<void> {
  const next = await findOldestWaitingPhoto(transaction, context.sender);
  if (next === null) return;
  const askText = chooseAskText(context.sender.role);
  await storeBotReply(transaction, next.id, { text: askText, kind: 'answer' });
  await enqueueReplyToMessage(transaction, context, next.id, askText);
}
