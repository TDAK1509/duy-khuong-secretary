import { createHash, timingSafeEqual } from 'node:crypto';
import { lookup as lookUpWithDns } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { request as requestOverHttps } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { z } from 'zod';
import type {
  ChannelRecipient,
  DownloadResult,
  InboundEvent,
  MessagingChannel,
  SendResult,
} from '../../services/messaging/messaging-channel.ts';

const ZALO_CHANNEL = 'zalo-oa';
const SIGNATURE_HEADER = 'x-zevent-signature';
const SIGNATURE_PREFIX = 'mac=';
const ZALO_MAX_TEXT_LENGTH = 2000;
const SEND_TEXT_PATH = '/v3.0/oa/message/cs';
const USER_DETAIL_PATH = '/v3.0/oa/user/detail';
const RATE_LIMIT_ERROR = -32;
const SERVER_ERROR_STATUS = 500;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const UNAVAILABLE: DownloadResult = { ok: false, reason: 'unavailable' };

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

const userDetailSchema = z.object({ error: z.literal(0), data: z.object({ display_name: z.string() }) });

const envelopeSchema = z.object({
  app_id: z.string(),
  timestamp: z.union([z.string(), z.number()]).transform(String),
});

type ZaloEvent = z.infer<typeof eventSchema>;

const IGNORED_EVENT: InboundEvent = { kind: 'ignored' };

export type ZaloOaChannelSettings = {
  appId: string;
  oaSecret: string;
  apiBaseUrl: string;
  timeoutMs: number;
  mediaHosts: string[];
  lookupAddresses?: (hostname: string) => Promise<string[]>;
  isPublicAddress?: (address: string) => boolean;
  trustedCertificates?: string;
};

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
    try {
      const response = await fetch(buildUserDetailUrl(this.settings.apiBaseUrl, user), {
        headers: { access_token: credential },
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
      if (!response.ok) return await discardBody(response);
      const answer = userDetailSchema.safeParse(await response.json());
      return answer.success ? answer.data.data.display_name : null;
    } catch {
      return null;
    }
  }

  async downloadAttachment(url: string, maxBytes: number): Promise<DownloadResult> {
    try {
      return await this.followRedirects(url, maxBytes);
    } catch {
      return UNAVAILABLE;
    }
  }

  private async followRedirects(firstUrl: string, maxBytes: number): Promise<DownloadResult> {
    let next = firstUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const target = this.parseAllowedUrl(next);
      if (target === null) break;
      const response = await this.openResponse(target);
      const location = readRedirectLocation(response);
      if (location === null) return readLimited(response, maxBytes);
      response.destroy();
      next = new URL(location, target).href;
    }
    return UNAVAILABLE;
  }

  private parseAllowedUrl(url: string): URL | null {
    const target = URL.canParse(url) ? new URL(url) : null;
    if (target !== null && isAllowedAttachmentUrl(target, this.settings.mediaHosts)) return target;
    console.error('[download] refused an attachment URL:', target === null ? 'not a URL' : `${target.origin}${target.pathname}`);
    return null;
  }

  private openResponse(url: URL): Promise<IncomingMessage> {
    const options = {
      agent: false,
      ca: this.settings.trustedCertificates,
      lookup: this.lookUpCheckedAddress,
      signal: AbortSignal.timeout(this.settings.timeoutMs),
    };
    return new Promise((resolve, reject) => {
      const request = requestOverHttps(url, options, resolve);
      request.on('error', reject);
      request.end();
    });
  }

  private readonly lookUpCheckedAddress: LookupFunction = (hostname, options, callback) => {
    const lookUpAddresses = this.settings.lookupAddresses ?? lookUpAllAddresses;
    void lookUpAddresses(hostname).then(
      (addresses) => callback(null, addresses.map((address) => ({ address, family: isIP(address) }))),
      (error: Error) => callback(error, []),
    );
  };

  private computeMac(rawBody: string, timestamp: string): string {
    const { appId, oaSecret } = this.settings;
    return createHash('sha256').update(`${appId}${rawBody}${timestamp}${oaSecret}`).digest('hex');
  }
}

async function readLimited(response: IncomingMessage, maxBytes: number): Promise<DownloadResult> {
  if (!isSuccessStatus(response.statusCode)) {
    response.destroy();
    return UNAVAILABLE;
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of response as AsyncIterable<Buffer>) {
    received += chunk.length;
    if (received > maxBytes) {
      response.destroy();
      return { ok: false, reason: 'too_large' };
    }
    chunks.push(chunk);
  }
  return { ok: true, bytes: new Uint8Array(Buffer.concat(chunks)) };
}

function readRedirectLocation(response: IncomingMessage): string | null {
  const isRedirect = response.statusCode !== undefined && REDIRECT_STATUSES.includes(response.statusCode);
  return isRedirect ? (response.headers.location ?? null) : null;
}

function isAllowedAttachmentUrl(url: URL, mediaHosts: string[]): boolean {
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false;
  return mediaHosts.some((mediaHost) => url.hostname === mediaHost || url.hostname.endsWith(`.${mediaHost}`));
}

function isSuccessStatus(status: number | undefined): boolean {
  return status !== undefined && status >= 200 && status < 300;
}

async function lookUpAllAddresses(hostname: string): Promise<string[]> {
  const found = await lookUpWithDns(hostname, { all: true });
  return found.map(({ address }) => address);
}

function buildUserDetailUrl(apiBaseUrl: string, user: ChannelRecipient): URL {
  const url = new URL(USER_DETAIL_PATH, apiBaseUrl);
  url.searchParams.set('data', JSON.stringify({ user_id: user.externalUserId }));
  return url;
}

async function discardBody(response: Response): Promise<null> {
  await response.body?.cancel();
  return null;
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
