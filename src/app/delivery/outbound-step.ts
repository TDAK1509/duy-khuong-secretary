import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { Clock } from '../../services/clock/clock.ts';
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
  const message = await claimOutboundMessage(dependencies.database, dependencies.clock.now());
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
