import type { Transaction } from '../db/transaction.ts';
import type { IntakeContext } from './intake-context.ts';
import { choosePhotoQuestion, enqueuePhotoQuestion } from './photo-question.ts';
import { storeBotReply } from './store-user-message.ts';
import { findOldestWaitingPhoto } from './waiting-photos.ts';

export async function askNextWaitingPhoto(transaction: Transaction, context: IntakeContext): Promise<void> {
  const next = await findOldestWaitingPhoto(transaction, context.sender);
  if (next === null) return;
  const question = choosePhotoQuestion(context.sender.role, next.codeChoice);
  await storeBotReply(transaction, next.id, { text: question.text, kind: 'answer' });
  await enqueuePhotoQuestion(transaction, context, next.id, question);
}
