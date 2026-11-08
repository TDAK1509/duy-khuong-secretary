import { formatReadData } from '../records/format-read-data.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import type { ReplyPlan } from './plan-reply.ts';

export type RepliedPlan = Pick<ReplyPlan, 'replyText' | 'saved'>;

export function formatReplyWithReadData({ replyText, saved }: RepliedPlan): string {
  return saved === null ? replyText : `${replyText}\n\n${formatReadData(saved)}`;
}

export function formatReplyForSender(reply: RepliedPlan, role: IntakeSender['role']): string {
  return role === 'admin' ? formatReplyWithReadData(reply) : reply.replyText;
}
