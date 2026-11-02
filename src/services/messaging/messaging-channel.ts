export interface ChannelRecipient {
  channel: string;
  accountId: string;
  externalUserId: string;
}

export type InboundEvent =
  | { kind: 'text'; eventId: string; from: ChannelRecipient; text: string; sentAt: Date }
  | { kind: 'images'; eventId: string; from: ChannelRecipient; imageUrls: string[]; caption: string | null; sentAt: Date }
  | { kind: 'ignored' };

export interface MessagingChannel {
  readonly channel: string;
  readonly maxTextLength: number;
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean;
  parseEvent(rawBody: string): InboundEvent;
}
