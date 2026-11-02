import type { InboundEvent } from '../../services/messaging/messaging-channel.ts';
import type { Transaction } from '../db/transaction.ts';

export type StorableEvent = Exclude<InboundEvent, { kind: 'ignored' }>;

export async function storeInboundEvent(transaction: Transaction, event: StorableEvent): Promise<void> {
  await transaction.query(
    `INSERT INTO inbound_events (channel, account_id, external_event_id, external_user_id, kind, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (channel, account_id, external_event_id) DO NOTHING`,
    [
      event.from.channel,
      event.from.accountId,
      event.eventId,
      event.from.externalUserId,
      event.kind,
      JSON.stringify(describePayload(event)),
    ],
  );
}

function describePayload(event: StorableEvent): Record<string, unknown> {
  const sentAt = event.sentAt.toISOString();
  if (event.kind === 'text') return { text: event.text, sent_at: sentAt };
  return { image_urls: event.imageUrls, caption: event.caption, sent_at: sentAt };
}
