import { z } from 'zod';

export type ClaimedEvent = {
  id: string;
  channel: string;
  accountId: string;
  externalUserId: string;
  kind: 'text' | 'images';
  payload: Record<string, unknown>;
  attempts: number;
};

const sentAtSchema = z.object({ sent_at: z.iso.datetime({ offset: true }) });

export function readSentAt(event: ClaimedEvent): Date {
  return new Date(sentAtSchema.parse(event.payload).sent_at);
}
