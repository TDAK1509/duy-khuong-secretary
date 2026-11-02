import { randomUUID } from 'node:crypto';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { Transaction } from '../db/transaction.ts';
import { clearChoiceUnlessAnswered } from '../identities/clear-pending-choice.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import { recordSenderIdentity } from '../processing/record-sender-identity.ts';
import type { Finished, NotConfigured, Stages } from '../processing/stages.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import type { IntakeContext, IntakeDependencies } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { readIntakeParts, type IntakePart } from './intake-parts.ts';
import { UPLOAD_ONLY_TEXT } from './intake-texts.ts';
import { receivePhoto } from './receive-photo.ts';
import { runStoreStage, storeBotReply } from './store-user-message.ts';

export type { IntakeDependencies };

export async function receiveIntake(
  dependencies: IntakeDependencies,
  stages: Stages,
  event: ClaimedEvent,
  sender: IntakeSender,
): Promise<Finished | NotConfigured> {
  if (event.kind === 'images' && dependencies.photoStorage === null) return { kind: 'not_configured', group: 'photos' };
  const context = { dependencies, stages, event, sender };
  const parts = readIntakeParts(event);
  const outcomes: IntakeOutcome[] = [];
  for (const part of parts) outcomes.push(await receivePart(context, part));
  const answeredText = event.kind === 'text' ? (parts[0]?.text ?? null) : null;
  return stages.finishEvent((transaction) => finishIntake(transaction, context, answeredText, outcomes));
}

function receivePart(context: IntakeContext, part: IntakePart): Promise<IntakeOutcome> {
  return part.imageUrl === null ? receiveText(context, part) : receivePhoto(context, { ...part, imageUrl: part.imageUrl });
}

async function receiveText(context: IntakeContext, part: IntakePart): Promise<IntakeOutcome> {
  const stored = await runStoreStage(context, { id: randomUUID(), text: part.text, imageKey: null, partIndex: part.index });
  return { kind: 'stored', messageId: stored.id, replyText: UPLOAD_ONLY_TEXT };
}

async function finishIntake(
  transaction: Transaction,
  context: IntakeContext,
  answeredText: string | null,
  outcomes: IntakeOutcome[],
): Promise<void> {
  const identity = await recordSenderIdentity(transaction, context.event);
  await clearChoiceUnlessAnswered(transaction, identity, answeredText);
  for (const outcome of outcomes) await sendReply(transaction, context, outcome);
}

async function sendReply(transaction: Transaction, context: IntakeContext, outcome: IntakeOutcome): Promise<void> {
  if (outcome.kind === 'already_replied') return;
  if (outcome.kind === 'stored' && !(await storeBotReply(transaction, outcome.messageId, outcome.replyText))) return;
  const { channel, clock } = context.dependencies;
  const { event } = context;
  await enqueueText(transaction, {
    to: { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId },
    text: outcome.replyText,
    maxTextLength: channel.maxTextLength,
    availableAt: clock.now(),
  });
}
