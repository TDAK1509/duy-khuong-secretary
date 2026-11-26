import type {
  DownloadResult,
  InboundEvent,
  MessagingChannel,
  SendResult,
} from '../../../src/services/messaging/messaging-channel.ts';

const JPEG_BYTES = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const NOT_USED = 'the stub messaging channel only downloads attachments';

export class StubMessagingChannel implements MessagingChannel {
  readonly channel = 'zalo-oa';
  readonly maxTextLength = 2000;

  async downloadAttachment(): Promise<DownloadResult> {
    return { ok: true, bytes: JPEG_BYTES };
  }

  verifyWebhook(): boolean {
    throw new Error(NOT_USED);
  }

  parseEvent(): InboundEvent {
    throw new Error(NOT_USED);
  }

  async sendText(): Promise<SendResult> {
    throw new Error(NOT_USED);
  }

  async sendImage(): Promise<SendResult> {
    throw new Error(NOT_USED);
  }

  async sendTemplate(): Promise<SendResult> {
    throw new Error(NOT_USED);
  }

  async getDisplayName(): Promise<string | null> {
    throw new Error(NOT_USED);
  }

  async reactWithThumbsUp(): Promise<SendResult> {
    throw new Error(NOT_USED);
  }
}
