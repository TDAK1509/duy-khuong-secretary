import { answerWithChat } from '../admin-chat/answer-with-chat.ts';
import type { ChatMessage } from '../admin-chat/chat-message.ts';
import type { IntakeContext } from './intake-context.ts';
import { logIntake, type LoggedReading } from './log-intake.ts';
import { isQuestionPending } from './store-user-message.ts';

export async function answerPendingQuestionAfterReply(
  context: IntakeContext,
  message: ChatMessage,
  reading: LoggedReading,
): Promise<void> {
  const isPending = await isQuestionPending(context.dependencies.database, message.id);
  logIntake(context, message.id, reading, isPending ? 'reply_then_admin_chat' : 'reply');
  if (isPending) await answerWithChat(context, message);
}
