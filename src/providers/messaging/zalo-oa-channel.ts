import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { ChannelRecipient, InboundEvent, MessagingChannel, SendResult } from '../../services/messaging/messaging-channel.ts';

const ZALO_CHANNEL = 'zalo-oa';
const SIGNATURE_HEADER = 'x-zevent-signature';
const SIGNATURE_PREFIX = 'mac=';
const ZALO_MAX_TEXT_LENGTH = 2000;
const SEND_TEXT_PATH = '/v3.0/oa/message/cs';
const USER_DETAIL_PATH = '/v3.0/oa/user/detail';
const RATE_LIMIT_ERROR = -32;
const SERVER_ERROR_STATUS = 500;

const REQUEST_NEVER_SENT_CODES = [
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
];

const attachmentSchema = z.object({
  type: z.string(),
  payload: z.object({ url: z.string().optional() }).optional(),
});

const eventSchema = z.object({
  event_name: z.string(),
  timestamp: z.coerce.number().refine(isDateTimestamp),
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  message: z.object({
    msg_id: z.string(),
    text: z.string().optional(),
    attachments: z.array(attachmentSchema).default([]),
  }),
});

const sendAnswerSchema = z.object({ error: z.number() });

const userDetailSchema = z.object({ data: z.object({ display_name: z.string() }) });

const envelopeSchema = z.object({
  app_id: z.string(),
  timestamp: z.union([z.string(), z.number()]).transform(String),
});

type ZaloEvent = z.infer<typeof eventSchema>;

const IGNORED_EVENT: InboundEvent = { kind: 'ignored' };

export type ZaloOaChannelSettings = { appId: string; oaSecret: string; apiBaseUrl: string; timeoutMs: number };

export class ZaloOaChannel implements MessagingChannel {
  readonly channel = ZALO_CHANNEL;
  readonly maxTextLength = ZALO_MAX_TEXT_LENGTH;
  private readonly settings: ZaloOaChannelSettings;

  constructor(settings: ZaloOaChannelSettings) {
    this.settings = settings;
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean {
    const header = headers[SIGNATURE_HEADER];
    const envelope = readJson(rawBody, envelopeSchema);
    if (!header?.startsWith(SIGNATURE_PREFIX) || envelope === null) return false;
    if (envelope.app_id !== this.settings.appId) return false;
    return isSameText(header.slice(SIGNATURE_PREFIX.length), this.computeMac(rawBody, envelope.timestamp));
  }

  parseEvent(rawBody: string): InboundEvent {
    const event = readJson(rawBody, eventSchema);
    return event === null ? IGNORED_EVENT : toInboundEvent(event);
  }

  async sendText(to: ChannelRecipient, text: string, credential: string): Promise<SendResult> {
    try {
      const response = await fetch(new URL(SEND_TEXT_PATH, this.settings.apiBaseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', access_token: credential },
        body: JSON.stringify({ recipient: { user_id: to.externalUserId }, message: { text } }),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
      return await readSendResult(response);
    } catch (error) {
      return { ok: false, reason: wasNeverSent(error) ? 'unavailable' : 'no_answer' };
    }
  }

  async getDisplayName(user: ChannelRecipient, credential: string): Promise<string | null> {
    const url = new URL(USER_DETAIL_PATH, this.settings.apiBaseUrl);
    url.searchParams.set('data', JSON.stringify({ user_id: user.externalUserId }));
    const response = await fetch(url, { headers: { access_token: credential }, signal: AbortSignal.timeout(this.settings.timeoutMs) });
    return userDetailSchema.parse(await response.json()).data.display_name;
  }

  private computeMac(rawBody: string, timestamp: string): string {
    const { appId, oaSecret } = this.settings;
    return createHash('sha256').update(`${appId}${rawBody}${timestamp}${oaSecret}`).digest('hex');
  }
}

async function readSendResult(response: Response): Promise<SendResult> {
  if (response.status < SERVER_ERROR_STATUS) return toSendResult(await response.json());
  await response.body?.cancel();
  return { ok: false, reason: 'no_answer' };
}

function toSendResult(answer: unknown): SendResult {
  const { error } = sendAnswerSchema.parse(answer);
  if (error === 0) return { ok: true };
  return { ok: false, reason: error === RATE_LIMIT_ERROR ? 'rate_limited' : 'rejected' };
}

function wasNeverSent(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : null;
  const code = cause instanceof Error && 'code' in cause ? cause.code : null;
  return typeof code === 'string' && REQUEST_NEVER_SENT_CODES.includes(code);
}

function isSameText(first: string, second: string): boolean {
  const firstBytes = Buffer.from(first);
  const secondBytes = Buffer.from(second);
  return firstBytes.length === secondBytes.length && timingSafeEqual(firstBytes, secondBytes);
}

function isDateTimestamp(milliseconds: number): boolean {
  return !Number.isNaN(new Date(milliseconds).getTime());
}

function readJson<Shape>(rawBody: string, schema: z.ZodType<Shape>): Shape | null {
  try {
    const parsed = schema.safeParse(JSON.parse(rawBody));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type EventBase = { eventId: string; from: ChannelRecipient; sentAt: Date };

function toInboundEvent(event: ZaloEvent): InboundEvent {
  const base: EventBase = {
    eventId: event.message.msg_id,
    from: { channel: ZALO_CHANNEL, accountId: event.recipient.id, externalUserId: event.sender.id },
    sentAt: new Date(event.timestamp),
  };
  switch (event.event_name) {
    case 'user_send_text':
      return toTextEvent(base, event);
    case 'user_send_image':
      return toImagesEvent(base, event);
    default:
      return IGNORED_EVENT;
  }
}

function toTextEvent(base: EventBase, event: ZaloEvent): InboundEvent {
  if (event.message.text === undefined) return IGNORED_EVENT;
  return { kind: 'text', ...base, text: event.message.text };
}

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
