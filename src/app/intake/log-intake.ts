import type { ReadAttempt } from '../reading/reading.ts';
import type { IntakeContext } from './intake-context.ts';
import type { ReplyPlan } from './plan-reply.ts';

export type IntakeRoute = 'reply' | 'admin_chat' | 'reply_then_admin_chat';

export type LoggedReading = { attempt: ReadAttempt | null; situation: ReplyPlan['situation'] };

export function logIntake(context: IntakeContext, messageId: string, { attempt, situation }: LoggedReading, route: IntakeRoute): void {
  const reading = attempt?.ok ? attempt.reading : null;
  const fields = [
    `message=${messageId}`,
    `role=${context.sender.role}`,
    `reader=${describeReader(attempt)}`,
    `situation=${situation === 'refused' ? 'unresolved' : situation}`,
    `items=${reading?.items.length ?? 0}`,
    `has_question=${reading?.has_question ?? false}`,
    `route=${route}`,
  ];
  console.log(`[intake] ${fields.join(' ')}`);
}

function describeReader(attempt: ReadAttempt | null): string {
  if (attempt === null) return 'not_run';
  return attempt.ok ? 'ok' : attempt.reason;
}
