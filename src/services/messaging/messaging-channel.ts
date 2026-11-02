export interface MessagingChannel {
  readonly channel: string;
  readonly maxTextLength: number;
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean;
}
