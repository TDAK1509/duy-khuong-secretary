import { z } from 'zod';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { Transaction } from '../db/transaction.ts';
import { clearChoiceUnlessAnswered } from '../identities/clear-pending-choice.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import { recordSenderIdentity } from '../processing/record-sender-identity.ts';
import type { Finished, Stages } from '../processing/stages.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import { UPLOAD_ONLY_TEXT } from './intake-texts.ts';
import { hasUserMessage, storeUserMessage, type IntakePart } from './store-user-message.ts';

const textPayloadSchema = z.object({ text: z.string() });

export type IntakeDependencies = { channel: MessagingChannel; clock: Clock };

export async function receiveIntake(
  dependencies: IntakeDependencies,
  stages: Stages,
  event: ClaimedEvent,
  sender: IntakeSender,
): Promise<Finished> {
  const part = readTextPart(event);
  await stages.runStage({
    isDone: (transaction) => hasUserMessage(transaction, event, part.index),
    write: (transaction) => storeUserMessage(transaction, event, sender, part),
  });
  return stages.finishEvent(async (transaction) => {
    await touchSender(transaction, event, part.text);
    await replyToSender(transaction, dependencies, event, UPLOAD_ONLY_TEXT);
  });
}

function readTextPart(event: ClaimedEvent): IntakePart {
  return { index: 0, text: textPayloadSchema.parse(event.payload).text, imageKey: null };
}

async function replyToSender(
  transaction: Transaction,
  { channel, clock }: IntakeDependencies,
  event: ClaimedEvent,
  text: string,
): Promise<void> {
  await enqueueText(transaction, {
    to: { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId },
    text,
    maxTextLength: channel.maxTextLength,
    availableAt: clock.now(),
  });
}

async function touchSender(transaction: Transaction, event: ClaimedEvent, text: string | null): Promise<void> {
  const identity = await recordSenderIdentity(transaction, event);
  await clearChoiceUnlessAnswered(transaction, identity, text);
}
