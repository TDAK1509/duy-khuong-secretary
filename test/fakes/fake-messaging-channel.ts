import type { Photo } from '../../src/services/storage/photo-storage.ts';
import type {
  ChannelRecipient,
  DownloadResult,
  InboundEvent,
  MessagingChannel,
  SendResult,
  TemplateMessage,
} from '../../src/services/messaging/messaging-channel.ts';

export type RecordedText = { to: ChannelRecipient; text: string; credential: string; quoteMessageId?: string };

export type RecordedTemplate = { to: ChannelRecipient; templateId: string; params: Record<string, string>; credential: string };

export type RecordedSend =
  | { kind: 'text'; to: string; text: string }
  | { kind: 'image'; to: string; photo: Photo; text?: string }
  | { kind: 'template'; to: string; templateId: string };

export class FakeMessagingChannel implements MessagingChannel {
  readonly channel = 'zalo-oa';
  readonly maxTextLength = 2000;
  readonly texts: RecordedText[] = [];
  readonly templates: RecordedTemplate[] = [];
  readonly sends: RecordedSend[] = [];
  readonly displayNames = new Map<string, string>();
  readonly nameLookupCredentials: string[] = [];
  readonly downloadedUrls: string[] = [];
  readonly attachments = new Map<string, DownloadResult>();
  nextTextResult: SendResult = { ok: true };
  whileSendingText: () => Promise<void> = async () => {};
  nextImageResult: SendResult = { ok: true };
  nextTemplateResult: SendResult = { ok: true };

  verifyWebhook(): boolean {
    return true;
  }

  parseEvent(): InboundEvent {
    return { kind: 'ignored' };
  }

  async sendText(to: ChannelRecipient, text: string, credential: string, quoteMessageId?: string): Promise<SendResult> {
    this.texts.push({ to, text, credential, ...(quoteMessageId !== undefined && { quoteMessageId }) });
    await this.whileSendingText();
    this.sends.push({ kind: 'text', to: to.externalUserId, text });
    return this.nextTextResult;
  }

  async sendImage(to: ChannelRecipient, photo: Photo, _credential: string, text?: string): Promise<SendResult> {
    this.sends.push({ kind: 'image', to: to.externalUserId, photo, ...(text !== undefined && { text }) });
    return this.nextImageResult;
  }

  async sendTemplate(to: ChannelRecipient, template: TemplateMessage, credential: string): Promise<SendResult> {
    this.templates.push({ to, templateId: template.templateId, params: template.params, credential });
    this.sends.push({ kind: 'template', to: to.externalUserId, templateId: template.templateId });
    return this.nextTemplateResult;
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
