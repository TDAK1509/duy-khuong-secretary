import type { InboundEvent } from '../../services/messaging/messaging-channel.ts';
import type { Transaction } from '../db/transaction.ts';

export type StorableEvent = Exclude<InboundEvent, { kind: 'ignored' }>;

export async function storeInboundEvent(transaction: Transaction, event: StorableEvent): Promise<void> {
  const { channel, accountId, externalUserId } = event.from;
  const payload = JSON.stringify(describePayload(event));
  await transaction.query(
    `INSERT INTO inbound_events (channel, account_id, external_event_id, external_user_id, kind, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (channel, account_id, external_event_id) DO NOTHING`,
    [channel, accountId, event.eventId, externalUserId, event.kind, payload],
  );
}

function describePayload(event: StorableEvent): Record<string, unknown> {
  const sentAt = event.sentAt.toISOString();
  if (event.kind === 'text') return describeTextPayload(event, sentAt);
  if (event.kind === 'images') return { image_urls: event.imageUrls, caption: event.caption, sent_at: sentAt };
  return describeFilePayload(event, sentAt);
}

function describeTextPayload(event: Extract<StorableEvent, { kind: 'text' }>, sentAt: string): Record<string, unknown> {
  const quote = event.quoteMessageId === undefined ? {} : { quote_msg_id: event.quoteMessageId };
  return { text: event.text, ...quote, sent_at: sentAt };
}

function describeFilePayload(event: Extract<StorableEvent, { kind: 'file' }>, sentAt: string): Record<string, unknown> {
  if (event.tooMany) return { too_many: true, sent_at: sentAt };
  return { file_url: event.fileUrl, file_name: event.fileName, file_size: event.fileSize, sent_at: sentAt };
}
