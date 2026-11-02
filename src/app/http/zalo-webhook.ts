import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { Database } from '../db/transaction.ts';
import { storeInboundEvent } from '../processing/store-inbound-event.ts';
import { respondWithJson, type HttpResponse } from './http-response.ts';

export type ZaloWebhookDependencies = {
  channel: MessagingChannel;
  database: Database;
};

export type WebhookRequest = {
  rawBody: string;
  headers: Record<string, string | undefined>;
};

export async function handleZaloWebhook(
  dependencies: ZaloWebhookDependencies,
  request: WebhookRequest,
): Promise<HttpResponse> {
  const event = dependencies.channel.parseEvent(request.rawBody);
  if (event.kind === 'ignored') return respondWithJson(200, { ok: true });
  await storeInboundEvent(dependencies.database, event);
  return respondWithJson(200, { ok: true });
}
