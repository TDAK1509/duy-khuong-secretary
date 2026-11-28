import { formatReadData } from '../records/format-read-data.ts';
import type { ReplyPlan } from './plan-reply.ts';

export type RepliedPlan = Pick<ReplyPlan, 'replyText' | 'saved' | 'keptPapers'>;

export function formatReplyWithReadData({ replyText, saved, keptPapers }: RepliedPlan): string {
  return saved === null ? replyText : `${replyText}\n\n${formatReadData(saved, keptPapers)}`;
}
