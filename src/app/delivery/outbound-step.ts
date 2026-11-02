import type { ChannelRecipient, MessagingChannel, SendResult } from '../../services/messaging/messaging-channel.ts';
import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import type { Clock } from '../../services/clock/clock.ts';
import { describeSendGotNoAnswer } from '../alerts/alert-texts.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import { readAccessKey } from '../channel-auth/read-access-key.ts';
import type { Database } from '../db/transaction.ts';
import { claimOutboundMessage } from './claim-outbound-message.ts';
import type { ClaimedMessage, MessageContent } from './claimed-message.ts';
import { decideNoConnectionOutcome } from './decide-send-outcome.ts';
import { applyOutcome, recordSendResult } from './record-send-result.ts';

export type OutboundDependencies = {
  database: Database;
  clock: Clock;
  alerts: OperatorAlerts;
  channel: MessagingChannel;
  photoStorage: PhotoStorage | null;
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

async function deliverMessage(dependencies: OutboundDependencies, message: ClaimedMessage): Promise<void> {
  if (!(await isAdminStillMember(dependencies.database, message))) {
    return applyOutcome(dependencies, message, { settlement: { status: 'failed', lastError: 'membership_changed' } });
  }
  const { database, clock, encryptionKey } = dependencies;
  const accessKey = await readAccessKey(database, message.to.channel, message.to.accountId, encryptionKey);
  if (accessKey === null) return applyOutcome(dependencies, message, decideNoConnectionOutcome(message, clock.now()));
  const result = await sendContent(dependencies, message.to, message.content, accessKey);
  await recordSendResult(dependencies, message, result);
}

async function sendContent(
  { channel, photoStorage }: OutboundDependencies,
  to: ChannelRecipient,
  content: MessageContent,
  accessKey: string,
): Promise<SendResult> {
  if (content.kind === 'text') return channel.sendText(to, content.body, accessKey);
  const photo = await photoStorage?.get(content.photoKey);
  if (!photo) throw new Error(`the photo ${content.photoKey} is missing`);
  return channel.sendImage(to, photo, accessKey);
}

async function isAdminStillMember(database: Database, message: ClaimedMessage): Promise<boolean> {
  if (message.adminMembershipId === null) return true;
  const { rows } = await database.query('SELECT 1 FROM memberships WHERE id = $1', [message.adminMembershipId]);
  return rows.length !== 0;
}
