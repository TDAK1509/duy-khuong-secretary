import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { Clock } from '../../services/clock/clock.ts';
import { describeSendGotNoAnswer } from '../alerts/alert-texts.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import { readAccessKey } from '../channel-auth/read-access-key.ts';
import type { Database } from '../db/transaction.ts';
import { claimOutboundMessage } from './claim-outbound-message.ts';
import type { ClaimedMessage } from './claimed-message.ts';
import { recordSendResult } from './record-send-result.ts';

export type OutboundDependencies = {
  database: Database;
  clock: Clock;
  alerts: OperatorAlerts;
  channel: MessagingChannel;
  encryptionKey: string;
  maxPerMinute: number;
};

export async function runOutboundStep(dependencies: OutboundDependencies): Promise<'processed' | 'idle'> {
  await markLostSendsUnknown(dependencies);
  const message = await claimOutboundMessage(dependencies.database, dependencies.clock.now(), dependencies.maxPerMinute);
  if (!message) return 'idle';
  await deliverMessage(dependencies, message);
  return 'processed';
}

async function deliverMessage(dependencies: OutboundDependencies, message: ClaimedMessage): Promise<void> {
  const { database, channel, encryptionKey } = dependencies;
  const accessKey = await readAccessKey(database, message.to.channel, message.to.accountId, encryptionKey);
  if (accessKey === null) return;
  const result = await channel.sendText(message.to, message.body, accessKey);
  await recordSendResult(dependencies, message, result);
}

async function markLostSendsUnknown({ database, clock, alerts }: OutboundDependencies): Promise<void> {
  const { rows } = await database.query<{ id: string }>(
    `UPDATE outbound_messages
     SET status = 'unknown', last_error = 'lock_expired', locked_until = NULL
     WHERE status = 'sending' AND locked_until < $1
     RETURNING id`,
    [clock.now()],
  );
  for (const { id } of rows) {
    await alerts.raise(describeSendGotNoAnswer(id));
  }
}
