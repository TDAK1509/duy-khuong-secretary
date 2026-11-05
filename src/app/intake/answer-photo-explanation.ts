import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { wrapExplanation } from './intake-texts.ts';
import { planReply } from './plan-reply.ts';
import { readMessage } from './reply-to-message.ts';
import { requirePhotoStorage } from './require-photo-storage.ts';
import { runReplyStage } from './run-reply-stage.ts';
import type { AskedPhoto } from './waiting-photos.ts';

export type Explanation = { id: string; text: string };

export async function answerPhotoExplanation(
  context: IntakeContext,
  explanation: Explanation,
  asked: AskedPhoto,
): Promise<IntakeOutcome> {
  const photo = await requirePhotoStorage(context).get(asked.imageKey);
  const decision = await readMessage(context, { text: wrapExplanation(explanation.text), photo });
  await runReplyStage(context, explanation.id, planReply(decision));
  return { kind: 'replied' };
}
