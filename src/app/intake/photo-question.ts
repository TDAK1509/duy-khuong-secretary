import type { Transaction } from '../db/transaction.ts';
import type { CodeChoice } from '../reading/code-choice.ts';
import { enqueueReply, enqueueReplyToMessage } from './enqueue-reply.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import type { IntakeContext } from './intake-context.ts';
import { chooseAskText, CODE_CHOICE_TEXT } from './intake-texts.ts';

export type PhotoQuestion = { text: string; candidates: string[] };

export function choosePhotoQuestion(role: IntakeSender['role'], codeChoice: CodeChoice | null): PhotoQuestion {
  if (codeChoice === null) return { text: chooseAskText(role), candidates: [] };
  return { text: CODE_CHOICE_TEXT, candidates: codeChoice.codes };
}

export async function enqueuePhotoQuestion(
  transaction: Transaction,
  context: IntakeContext,
  photoId: string,
  { text, candidates }: PhotoQuestion,
): Promise<void> {
  await enqueueReplyToMessage(transaction, context, photoId, text);
  await enqueueCandidates(transaction, context, candidates);
}

export async function enqueueCandidates(transaction: Transaction, context: IntakeContext, candidates: string[]): Promise<void> {
  for (const candidate of candidates) await enqueueReply(transaction, context, candidate);
}
