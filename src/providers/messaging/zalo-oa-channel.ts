import { createHash, timingSafeEqual } from 'node:crypto';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';

const SIGNATURE_HEADER = 'x-zevent-signature';
const SIGNATURE_PREFIX = 'mac=';
const ZALO_MAX_TEXT_LENGTH = 2000;

export type ZaloOaChannelSettings = { appId: string; oaSecret: string };

export class ZaloOaChannel implements MessagingChannel {
  readonly channel = 'zalo-oa';
  readonly maxTextLength = ZALO_MAX_TEXT_LENGTH;
  private readonly settings: ZaloOaChannelSettings;

  constructor(settings: ZaloOaChannelSettings) {
    this.settings = settings;
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean {
    const sent = (headers[SIGNATURE_HEADER] ?? '').slice(SIGNATURE_PREFIX.length);
    const { timestamp } = JSON.parse(rawBody) as { timestamp: string };
    const expected = this.computeMac(rawBody, timestamp);
    return timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  }

  private computeMac(rawBody: string, timestamp: string): string {
    const { appId, oaSecret } = this.settings;
    return createHash('sha256').update(`${appId}${rawBody}${timestamp}${oaSecret}`).digest('hex');
  }
}
