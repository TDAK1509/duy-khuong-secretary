import { randomUUID } from 'node:crypto';
import { toDatabaseScope } from '../access/to-database-scope.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import type { Transaction } from '../db/transaction.ts';
import { hasOfferedChoice } from '../delivery/has-offered-choice.ts';
import { clearChoiceUnlessAnswered } from '../identities/clear-pending-choice.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import { recordSenderIdentity } from '../processing/record-sender-identity.ts';
import type { Finished, NotConfigured, Stages } from '../processing/stages.ts';
import { enqueueRefusal } from './enqueue-reply.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import type { IntakeContext, IntakeDependencies } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { readIntakeParts, type IntakePart } from './intake-parts.ts';
import { answerOwedQuestion } from './answer-owed-question.ts';
import { answerPhotoCode } from './answer-photo-code.ts';
import { answerPhotoExplanation } from './answer-photo-explanation.ts';
import { matchCodeAnswer } from './match-code-answer.ts';
import { loadKeptPhoto, receivePhoto } from './receive-photo.ts';
import { replyToMessage, type MessageToRead } from './reply-to-message.ts';
import { findUserMessage, runStoreStage } from './store-user-message.ts';
import { endExpiredWaits, findAskedPhoto, type AskedPhoto } from './waiting-photos.ts';

export async function receiveIntake(
  unscopedDependencies: IntakeDependencies,
  unscopedStages: Stages,
  event: ClaimedEvent,
  sender: IntakeSender,
): Promise<Finished | NotConfigured> {
  const scope = toDatabaseScope(sender);
  const dependencies = { ...unscopedDependencies, database: scopeDatabase(unscopedDependencies.database, scope) };
  const stages = unscopedStages.forScope(scope);
  const { photoStorage, readers, chat } = dependencies;
  if (sender.role === 'admin' && chat === null) return { kind: 'not_configured', group: 'chat' };
  if (event.kind === 'images' && photoStorage === null) return { kind: 'not_configured', group: 'photos' };
  if (readers === null) return { kind: 'not_configured', group: 'readers' };
  const context = { dependencies, readers, stages, event, sender };
  const parts = readIntakeParts(event);
  const outcomes: IntakeOutcome[] = [];
  for (const part of parts) outcomes.push(await receivePart(context, part));
  return stages.finishEvent((transaction) => finishIntake(transaction, context, readAnsweredText(event, parts), outcomes));
}

function readAnsweredText(event: ClaimedEvent, parts: IntakePart[]): string | null {
  return event.kind === 'text' ? (parts[0]?.text ?? null) : null;
}

function receivePart(context: IntakeContext, part: IntakePart): Promise<IntakeOutcome> {
  return part.imageUrl === null ? receiveText(context, part) : receivePhoto(context, { ...part, imageUrl: part.imageUrl });
}

async function receiveText(context: IntakeContext, part: IntakePart): Promise<IntakeOutcome> {
  const existing = await findUserMessage(context.dependencies.database, context.event, part.index);
  if (existing?.questionPending) {
    return answerOwedQuestion(context, { id: existing.id, text: part.text, photo: await loadKeptPhoto(context, existing) });
  }
  if (existing?.isReplied) return { kind: 'replied' };
  const stored = await runStoreStage(context, { id: randomUUID(), text: part.text, imageKey: null, partIndex: part.index });
  return replyToStoredText(context, { id: stored.id, text: part.text, photo: null });
}

async function replyToStoredText(context: IntakeContext, message: MessageToRead): Promise<IntakeOutcome> {
  const { dependencies, sender, stages } = context;
  await stages.runStage({
    isDone: async () => false,
    write: (transaction) => endExpiredWaits(transaction, sender, dependencies.clock.now()),
  });
  const asked = await findAskedPhoto(dependencies.database, sender);
  if (asked !== null && message.text !== null) return answerAskedPhoto(context, { id: message.id, text: message.text }, asked);
  return replyToMessage(context, message);
}

function answerAskedPhoto(context: IntakeContext, explanation: { id: string; text: string }, asked: AskedPhoto): Promise<IntakeOutcome> {
  const { codeChoice } = asked;
  if (codeChoice === null) return answerPhotoExplanation(context, explanation, asked);
  const code = matchCodeAnswer(explanation.text, codeChoice.codes);
  if (code === null) return answerPhotoExplanation(context, explanation, asked);
  return answerPhotoCode(context, explanation, asked, { codeChoice, code });
}

async function finishIntake(
  transaction: Transaction,
  context: IntakeContext,
  answeredText: string | null,
  outcomes: IntakeOutcome[],
): Promise<void> {
  const identity = await recordSenderIdentity(transaction, context.event);
  if (!(await hasOfferedChoice(transaction, context.event.id))) {
    await clearChoiceUnlessAnswered(transaction, identity, answeredText);
  }
  for (const outcome of outcomes) await sendRefusal(transaction, context, outcome);
}

async function sendRefusal(transaction: Transaction, context: IntakeContext, outcome: IntakeOutcome): Promise<void> {
  if (outcome.kind === 'refused') await enqueueRefusal(transaction, context, outcome.replyText);
}
