import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import { describeWebhookStoreFailed } from '../alerts/alert-texts.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import { hasConnection } from '../channel-auth/has-connection.ts';
import { runWithDeadline } from '../db/run-with-deadline.ts';
import type { Database, Transaction } from '../db/transaction.ts';
import { storeInboundEvent, type StorableEvent } from '../processing/store-inbound-event.ts';
import { respondWithJson, type HttpResponse } from './http-response.ts';

const STORE_DEADLINE_MS = 700;

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
  dependencies: ZaloWebhookDependencies | null,
  request: WebhookRequest,
): Promise<HttpResponse> {
  if (dependencies === null) return respondWithJson(503, { ok: false });
  const { channel } = dependencies;
  if (!channel.verifyWebhook(request.rawBody, request.headers)) return respondWithJson(401, { ok: false });
  const event = channel.parseEvent(request.rawBody);
  if (event.kind === 'ignored') return respondWithJson(200, { ok: true });
  try {
    return await runWithDeadline(dependencies.database, STORE_DEADLINE_MS, (transaction) =>
      storeEventOfConnectedAccount(transaction, event),
    );
  } catch (error) {
    await dependencies.alerts.raise(describeWebhookStoreFailed(error instanceof Error ? error.name : 'unknown error'));
    return respondWithJson(500, { ok: false });
  }
}

async function storeEventOfConnectedAccount(transaction: Transaction, event: StorableEvent): Promise<HttpResponse> {
  if (!(await hasConnection(transaction, event.from.channel, event.from.accountId))) {
    console.error('[webhook] event for an OA that is not connected:', event.from.accountId);
    return respondWithJson(200, { ok: true });
  }
  await storeInboundEvent(transaction, event);
  return respondWithJson(200, { ok: true });
}
