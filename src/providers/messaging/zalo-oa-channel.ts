import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { ChannelRecipient, InboundEvent, MessagingChannel } from '../../services/messaging/messaging-channel.ts';

const SIGNATURE_HEADER = 'x-zevent-signature';
const SIGNATURE_PREFIX = 'mac=';
const ZALO_MAX_TEXT_LENGTH = 2000;

const attachmentSchema = z.object({
  type: z.string(),
  payload: z.object({ url: z.string().optional() }).optional(),
});

const eventSchema = z.object({
  event_name: z.string(),
  timestamp: z.coerce.number(),
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  message: z.object({
    msg_id: z.string(),
    text: z.string().optional(),
    attachments: z.array(attachmentSchema).default([]),
  }),
});

type ZaloEvent = z.infer<typeof eventSchema>;

const IGNORED_EVENT: InboundEvent = { kind: 'ignored' };

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
    const event = readEvent(rawBody);
    if (event === null) return IGNORED_EVENT;
    const base = {
      eventId: event.message.msg_id,
      from: { channel: this.channel, accountId: event.recipient.id, externalUserId: event.sender.id },
      sentAt: new Date(event.timestamp),
    };
    switch (event.event_name) {
      case 'user_send_text':
        return event.message.text === undefined ? IGNORED_EVENT : { kind: 'text', ...base, text: event.message.text };
      case 'user_send_image':
        return toImagesEvent(base, event);
      default:
        return IGNORED_EVENT;
    }
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

function readEvent(rawBody: string): ZaloEvent | null {
  try {
    const parsed = eventSchema.safeParse(JSON.parse(rawBody));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type EventBase = { eventId: string; from: ChannelRecipient; sentAt: Date };

function toImagesEvent(base: EventBase, event: ZaloEvent): InboundEvent {
  const imageUrls = collectImageUrls(event);
  if (imageUrls.length === 0) return IGNORED_EVENT;
  return { kind: 'images', ...base, imageUrls, caption: event.message.text || null };
}

function collectImageUrls(event: ZaloEvent): string[] {
  return event.message.attachments.flatMap((attachment) =>
    attachment.type === 'image' && attachment.payload?.url ? [attachment.payload.url] : [],
  );
}
