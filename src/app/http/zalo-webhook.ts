import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { Database } from '../db/transaction.ts';
import { hasConnection } from '../channel-auth/has-connection.ts';
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
  if (!dependencies.channel.verifyWebhook(request.rawBody, request.headers)) return respondWithJson(401, { ok: false });
  const event = dependencies.channel.parseEvent(request.rawBody);
  if (event.kind === 'ignored') return respondWithJson(200, { ok: true });
  const { database } = dependencies;
  if (!(await hasConnection(database, event.from.channel, event.from.accountId))) {
    console.error('[webhook] event for an OA that is not connected:', event.from.accountId);
    return respondWithJson(403, { ok: false });
  }
  await storeInboundEvent(database, event);
  return respondWithJson(200, { ok: true });
}
