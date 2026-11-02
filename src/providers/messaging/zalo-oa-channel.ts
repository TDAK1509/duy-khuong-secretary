import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { InboundEvent, MessagingChannel } from '../../services/messaging/messaging-channel.ts';

const SIGNATURE_HEADER = 'x-zevent-signature';
const SIGNATURE_PREFIX = 'mac=';
const ZALO_MAX_TEXT_LENGTH = 2000;

const textEventSchema = z.object({
  event_name: z.literal('user_send_text'),
  timestamp: z.coerce.number(),
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  message: z.object({ msg_id: z.string(), text: z.string() }),
});

export type ZaloOaChannelSettings = { appId: string; oaSecret: string };

export class ZaloOaChannel implements MessagingChannel {
  readonly channel = 'zalo-oa';
  readonly maxTextLength = ZALO_MAX_TEXT_LENGTH;
  private readonly settings: ZaloOaChannelSettings;

  constructor(settings: ZaloOaChannelSettings) {
    this.settings = settings;
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean {
    const header = headers[SIGNATURE_HEADER];
    if (!header?.startsWith(SIGNATURE_PREFIX)) return false;
    const { timestamp } = JSON.parse(rawBody) as { timestamp: string };
    return isSameText(header.slice(SIGNATURE_PREFIX.length), this.computeMac(rawBody, timestamp));
  }

  parseEvent(rawBody: string): InboundEvent {
    const event = textEventSchema.parse(JSON.parse(rawBody));
    return {
      kind: 'text',
      eventId: event.message.msg_id,
      from: { channel: this.channel, accountId: event.recipient.id, externalUserId: event.sender.id },
      text: event.message.text,
      sentAt: new Date(event.timestamp),
    };
  }

  private computeMac(rawBody: string, timestamp: string): string {
    const { appId, oaSecret } = this.settings;
    return createHash('sha256').update(`${appId}${rawBody}${timestamp}${oaSecret}`).digest('hex');
  }
}

function isSameText(first: string, second: string): boolean {
  const firstBytes = Buffer.from(first);
  const secondBytes = Buffer.from(second);
  return firstBytes.length === secondBytes.length && timingSafeEqual(firstBytes, secondBytes);
}
