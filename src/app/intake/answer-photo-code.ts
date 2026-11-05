import type { CodeChoice } from '../reading/code-choice.ts';
import { runAnswerStage } from './answer-photo-explanation.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { planCodeAnswer } from './plan-reply.ts';
import type { AskedPhoto } from './waiting-photos.ts';

export async function answerPhotoCode(
  context: IntakeContext,
  explanation: { id: string; text: string },
  asked: AskedPhoto,
  answer: { codeChoice: CodeChoice; code: string },
): Promise<IntakeOutcome> {
  await runAnswerStage(context, { explanation, asked }, planCodeAnswer(answer.codeChoice, answer.code));
  return { kind: 'replied' };
}
