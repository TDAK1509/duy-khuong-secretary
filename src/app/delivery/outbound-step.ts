import type { ChannelRecipient, MessagingChannel, SendResult } from '../../services/messaging/messaging-channel.ts';
import type { Photo, PhotoStorage } from '../../services/storage/photo-storage.ts';
import type { Clock } from '../../services/clock/clock.ts';
import { describeSendGotNoAnswer } from '../alerts/alert-texts.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import { readAccessKey } from '../channel-auth/read-access-key.ts';
import type { Database } from '../db/transaction.ts';
import type { OffGroupNotices } from '../processing/off-group-notices.ts';
import { claimOutboundMessage } from './claim-outbound-message.ts';
import { mayBeHeld, type ClaimedMessage, type MessageContent } from './claimed-message.ts';
import { decideNoConnectionOutcome } from './decide-send-outcome.ts';
import { isWithinWindow, readLastInboundAt } from './recipient-window.ts';
import { postponeOutboundMessage } from './postpone-outbound-message.ts';
import { applyOutcome, recordSendResult } from './record-send-result.ts';

export type OutboundDependencies = {
  database: Database;
  clock: Clock;
  alerts: OperatorAlerts;
  notices: OffGroupNotices;
  channel: MessagingChannel;
  photoStorage: PhotoStorage | null;
  encryptionKey: string;
  maxPerMinute: number;
  reportReadyTemplateId: string | null;
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
  if (!(await isStillAdmin(dependencies.database, message))) return failMessage(dependencies, message, 'membership_changed');
  const lastInboundAt = await readLastInboundOfHoldableRecipient(dependencies.database, message);
  if (isOutsideWindow(message, lastInboundAt, dependencies.clock.now())) return holdMessage(dependencies, message, lastInboundAt);
  if (message.content.kind === 'image' && dependencies.photoStorage === null) {
    return postponeOutboundMessage(dependencies, message, 'photos');
  }
  const payload = await loadPayload(dependencies.photoStorage, message.content);
  if (payload === null) return failMessage(dependencies, message, 'photo_missing');
  await sendToRecipient(dependencies, message, payload, lastInboundAt);
}

function readLastInboundOfHoldableRecipient(database: Database, message: ClaimedMessage): Promise<Date | null> {
  return mayBeHeld(message) ? readLastInboundAt(database, message.to) : Promise.resolve(null);
}

function isOutsideWindow(message: ClaimedMessage, lastInboundAt: Date | null, now: Date): boolean {
  return mayBeHeld(message) && !isWithinWindow(lastInboundAt, now);
}

function holdMessage(dependencies: OutboundDependencies, message: ClaimedMessage, lastInboundAt: Date | null): Promise<void> {
  const settlement = { status: 'held' as const, lastError: 'outside_window', recheck: { lastInboundAt } };
  return applyOutcome(dependencies, message, { settlement });
}

async function sendToRecipient(
  dependencies: OutboundDependencies,
  message: ClaimedMessage,
  payload: Payload,
  lastInboundAt: Date | null,
): Promise<void> {
  const { database, clock, encryptionKey } = dependencies;
  const accessKey = await readAccessKey(database, message.to.channel, message.to.accountId, encryptionKey);
  if (accessKey === null) return applyOutcome(dependencies, message, decideNoConnectionOutcome(message, clock.now()));
  if (!(await isStillAdmin(database, message))) return failMessage(dependencies, message, 'membership_changed');
  const result = await sendPayload(dependencies.channel, message.to, payload, accessKey);
  await recordSendResult(dependencies, message, result, lastInboundAt);
}

function failMessage(dependencies: OutboundDependencies, message: ClaimedMessage, reason: string): Promise<void> {
  return applyOutcome(dependencies, message, { settlement: { status: 'failed', lastError: reason } });
}

type Payload = Exclude<MessageContent, { kind: 'image' }> | { kind: 'image'; photo: Photo; text?: string };

async function loadPayload(photoStorage: PhotoStorage | null, content: MessageContent): Promise<Payload | null> {
  if (content.kind !== 'image') return content;
  const photo = await photoStorage?.get(content.photoKey);
  return photo ? { kind: 'image', photo, text: content.text } : null;
}

function sendPayload(channel: MessagingChannel, to: ChannelRecipient, payload: Payload, accessKey: string): Promise<SendResult> {
  switch (payload.kind) {
    case 'text':
      return channel.sendText(to, payload.body, accessKey, payload.quote?.messageId);
    case 'image':
      return channel.sendImage(to, payload.photo, accessKey, payload.text);
    case 'template':
      return channel.sendTemplate(to, payload, accessKey);
  }
}

async function isStillAdmin(database: Database, message: ClaimedMessage): Promise<boolean> {
  if (message.adminMembershipId === null) return true;
  const { rows } = await database.query(`SELECT 1 FROM memberships WHERE id = $1 AND role = 'admin'`, [
    message.adminMembershipId,
  ]);
  return rows.length !== 0;
}
