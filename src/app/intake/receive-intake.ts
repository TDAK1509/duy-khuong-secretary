import { z } from 'zod';
import type { Transaction } from '../db/transaction.ts';
import { clearChoiceUnlessAnswered } from '../identities/clear-pending-choice.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import { recordSenderIdentity } from '../processing/record-sender-identity.ts';
import type { Finished, Stages } from '../processing/stages.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import { hasUserMessage, storeUserMessage, type IntakePart } from './store-user-message.ts';

const textPayloadSchema = z.object({ text: z.string() });

export async function receiveIntake(stages: Stages, event: ClaimedEvent, sender: IntakeSender): Promise<Finished> {
  const part = readTextPart(event);
  await stages.runStage({
    isDone: (transaction) => hasUserMessage(transaction, event, part.index),
    write: (transaction) => storeUserMessage(transaction, event, sender, part),
  });
  return stages.finishEvent(async (transaction) => {
    await touchSender(transaction, event, part.text);
  });
}

function readTextPart(event: ClaimedEvent): IntakePart {
  return { index: 0, text: textPayloadSchema.parse(event.payload).text, imageKey: null };
}

async function touchSender(transaction: Transaction, event: ClaimedEvent, text: string | null): Promise<void> {
  const identity = await recordSenderIdentity(transaction, event);
  await clearChoiceUnlessAnswered(transaction, identity, text);
}
