import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import { describeWebhookStoreFailed } from '../alerts/alert-texts.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import { hasConnection } from '../channel-auth/has-connection.ts';
import type { Database } from '../db/transaction.ts';
import { storeInboundEvent, type StorableEvent } from '../processing/store-inbound-event.ts';
import { respondWithJson, type HttpResponse } from './http-response.ts';

export type ZaloWebhookDependencies = {
  channel: MessagingChannel;
  database: Database;
  alerts: OperatorAlerts;
};

export type WebhookRequest = {
  rawBody: string;
  headers: Record<string, string | undefined>;
};

export async function handleZaloWebhook(
  dependencies: ZaloWebhookDependencies,
  request: WebhookRequest,
): Promise<HttpResponse> {
  const { channel } = dependencies;
  if (!channel.verifyWebhook(request.rawBody, request.headers)) return respondWithJson(401, { ok: false });
  const event = channel.parseEvent(request.rawBody);
  if (event.kind === 'ignored') return respondWithJson(200, { ok: true });
  try {
    return await storeEventOfConnectedAccount(dependencies.database, event);
  } catch (error) {
    await dependencies.alerts.raise(describeWebhookStoreFailed(error instanceof Error ? error.name : 'unknown error'));
    return respondWithJson(500, { ok: false });
  }
}

async function storeEventOfConnectedAccount(database: Database, event: StorableEvent): Promise<HttpResponse> {
  if (!(await hasConnection(database, event.from.channel, event.from.accountId))) {
    console.error('[webhook] event for an OA that is not connected:', event.from.accountId);
    return respondWithJson(403, { ok: false });
  }
  await storeInboundEvent(database, event);
  return respondWithJson(200, { ok: true });
}
