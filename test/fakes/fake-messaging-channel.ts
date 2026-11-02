import type {
  ChannelRecipient,
  DownloadResult,
  InboundEvent,
  MessagingChannel,
  SendResult,
} from '../../src/services/messaging/messaging-channel.ts';

export type RecordedText = { to: ChannelRecipient; text: string; credential: string };

export class FakeMessagingChannel implements MessagingChannel {
  readonly channel = 'zalo-oa';
  readonly maxTextLength = 2000;
  readonly texts: RecordedText[] = [];
  readonly displayNames = new Map<string, string>();
  readonly nameLookupCredentials: string[] = [];
  readonly downloadedUrls: string[] = [];
  readonly attachments = new Map<string, DownloadResult>();
  nextTextResult: SendResult = { ok: true };

  verifyWebhook(): boolean {
    return true;
  }

  parseEvent(): InboundEvent {
    return { kind: 'ignored' };
  }

  async sendText(to: ChannelRecipient, text: string, credential: string): Promise<SendResult> {
    this.texts.push({ to, text, credential });
    return this.nextTextResult;
  }

  async getDisplayName(user: ChannelRecipient, credential: string): Promise<string | null> {
    this.nameLookupCredentials.push(credential);
    return this.displayNames.get(user.externalUserId) ?? null;
  }

  async downloadAttachment(url: string): Promise<DownloadResult> {
    this.downloadedUrls.push(url);
    return this.attachments.get(url) ?? { ok: false, reason: 'unavailable' };
  }
}
