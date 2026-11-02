import { answerWithChat } from '../admin-chat/answer-with-chat.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import type { MessageToRead } from './reply-to-message.ts';

export async function answerOwedQuestion(context: IntakeContext, message: MessageToRead): Promise<IntakeOutcome> {
  await answerWithChat(context, message);
  return { kind: 'replied' };
}
