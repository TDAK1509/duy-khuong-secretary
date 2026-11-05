import { createHash, timingSafeEqual } from 'node:crypto';
import { lookup as lookUpWithDns } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { request as requestOverHttps } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { z } from 'zod';
import type {
  ChannelRecipient,
  DownloadResult,
  InboundEvent,
  MessagingChannel,
  SendResult,
  TemplateMessage,
} from '../../services/messaging/messaging-channel.ts';
import type { Photo } from '../../services/storage/photo-storage.ts';

const ZALO_CHANNEL = 'zalo-oa';
const SIGNATURE_HEADER = 'x-zevent-signature';
const SIGNATURE_PREFIX = 'mac=';
const ZALO_MAX_TEXT_LENGTH = 2000;
const SEND_MESSAGE_PATH = '/v3.0/oa/message/cs';
const SEND_TEMPLATE_PATH = '/v3.0/oa/message/template';
const UPLOAD_IMAGE_PATH = '/v2.0/oa/upload/image';
const USER_DETAIL_PATH = '/v3.0/oa/user/detail';
const RATE_LIMIT_ERROR = -32;
const WINDOW_CLOSED_ERROR = -230;
const SERVER_ERROR_STATUS = 500;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const NON_PUBLIC_IPV4_RANGES: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const NON_PUBLIC_IPV6_RANGES: [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];
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

const uploadAnswerSchema = z.object({
  error: z.number(),
  data: z.object({ attachment_id: z.string() }).optional(),
});

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
  businessApiBaseUrl: string;
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

  async sendText(to: ChannelRecipient, text: string, credential: string, quoteMessageId?: string): Promise<SendResult> {
    const message = { text, ...(quoteMessageId !== undefined && { quote_message_id: quoteMessageId }) };
    return guardSend(() => this.postMessage(to, message, credential));
  }

  async sendImage(to: ChannelRecipient, photo: Photo, credential: string, text?: string): Promise<SendResult> {
    return guardSend(async () => {
      const upload = await this.uploadImage(photo, credential);
      return upload.ok ? this.postMessage(to, buildImageMessage(upload.attachmentId, text), credential) : upload;
    });
  }

  async sendTemplate(to: ChannelRecipient, template: TemplateMessage, credential: string): Promise<SendResult> {
    const url = new URL(SEND_TEMPLATE_PATH, this.settings.businessApiBaseUrl);
    const body = { user_id: to.externalUserId, template_id: template.templateId, template_data: template.params };
    return guardSend(() => this.postJson(url, body, credential));
  }

  private postMessage(to: ChannelRecipient, message: object, credential: string): Promise<SendResult> {
    const url = new URL(SEND_MESSAGE_PATH, this.settings.apiBaseUrl);
    return this.postJson(url, { recipient: { user_id: to.externalUserId }, message }, credential);
  }

  private async postJson(url: URL, body: object, credential: string): Promise<SendResult> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', access_token: credential },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.settings.timeoutMs),
    });
    return readSendResult(response);
  }

  private async uploadImage(photo: Photo, credential: string): Promise<UploadResult> {
    const form = new FormData();
    form.set('file', new Blob([photo.bytes], { type: photo.contentType }), toUploadFileName(photo));
    const response = await fetch(new URL(UPLOAD_IMAGE_PATH, this.settings.apiBaseUrl), {
      method: 'POST',
      headers: { access_token: credential },
      body: form,
      signal: AbortSignal.timeout(this.settings.timeoutMs),
    });
    return readUploadResult(response);
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
    this.resolvePublicAddresses(hostname).then(
      (addresses) => answerLookup(callback, options.all === true, addresses),
      (error: Error) => callback(error, '', 4),
    );
  };

  private async resolvePublicAddresses(hostname: string): Promise<string[]> {
    const addresses = await (this.settings.lookupAddresses ?? lookUpAllAddresses)(hostname);
    const isPublic = this.settings.isPublicAddress ?? isPublicAddress;
    if (addresses.length === 0 || !addresses.every(isPublic)) {
      console.error('[download] refused a host that does not resolve to public addresses:', hostname);
      throw new Error('the host does not resolve to public addresses');
    }
    return addresses;
  }

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

function answerLookup(callback: Parameters<LookupFunction>[2], wantsAll: boolean, addresses: string[]): void {
  if (wantsAll) return callback(null, addresses.map((address) => ({ address, family: isIP(address) })));
  const [first = ''] = addresses;
  callback(null, first, isIP(first));
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address) === 6 ? 'ipv6' : 'ipv4';
  return isIP(address) !== 0 && !NON_PUBLIC_ADDRESSES.check(address, family);
}

const NON_PUBLIC_ADDRESSES = buildNonPublicAddresses();

function buildNonPublicAddresses(): BlockList {
  const list = new BlockList();
  for (const [network, prefix] of NON_PUBLIC_IPV4_RANGES) list.addSubnet(network, prefix, 'ipv4');
  for (const [network, prefix] of NON_PUBLIC_IPV6_RANGES) list.addSubnet(network, prefix, 'ipv6');
  return list;
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

type FailedSend = Extract<SendResult, { ok: false }>;
type UploadResult = { ok: true; attachmentId: string } | FailedSend;

async function guardSend(send: () => Promise<SendResult>): Promise<SendResult> {
  try {
    return await send();
  } catch (error) {
    return { ok: false, reason: wasNeverSent(error) ? 'unavailable' : 'no_answer' };
  }
}

function buildImageMessage(attachmentId: string, text: string | undefined): object {
  const elements = [{ media_type: 'image', attachment_id: attachmentId }];
  const attachment = { type: 'template', payload: { template_type: 'media', elements } };
  return { ...(text !== undefined && { text }), attachment };
}

function toUploadFileName(photo: Photo): string {
  return photo.contentType === 'image/png' ? 'photo.png' : 'photo.jpg';
}

async function readSendResult(response: Response): Promise<SendResult> {
  if (response.status < SERVER_ERROR_STATUS) return toSendResult(await response.json());
  await response.body?.cancel();
  return { ok: false, reason: 'no_answer' };
}

function toSendResult(answer: unknown): SendResult {
  const { error } = sendAnswerSchema.parse(answer);
  return error === 0 ? { ok: true } : toFailedSend(error);
}

async function readUploadResult(response: Response): Promise<UploadResult> {
  if (response.status >= SERVER_ERROR_STATUS) {
    await response.body?.cancel();
    return { ok: false, reason: 'no_answer' };
  }
  const answer = uploadAnswerSchema.parse(await response.json());
  if (answer.error !== 0) return toFailedSend(answer.error);
  if (answer.data === undefined) throw new Error('the upload answer has no attachment id');
  return { ok: true, attachmentId: answer.data.attachment_id };
}

function toFailedSend(error: number): FailedSend {
  if (error === RATE_LIMIT_ERROR) return { ok: false, reason: 'rate_limited' };
  if (error === WINDOW_CLOSED_ERROR) return { ok: false, reason: 'window_closed' };
  console.error(`[zalo] send rejected: error ${error}`);
  return { ok: false, reason: 'rejected' };
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
