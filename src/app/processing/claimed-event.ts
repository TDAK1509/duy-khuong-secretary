import { z } from 'zod';

export type ClaimedEvent = {
  id: string;
  channel: string;
  accountId: string;
  externalUserId: string;
  externalEventId: string;
  isFirstPickup: boolean;
  kind: 'text' | 'images' | 'file';
  payload: Record<string, unknown>;
  attempts: number;
  claimToken: string;
};

const sentAtSchema = z.object({ sent_at: z.iso.datetime({ offset: true }) });

export function readSentAt(event: ClaimedEvent): Date {
  return new Date(sentAtSchema.parse(event.payload).sent_at);
}
