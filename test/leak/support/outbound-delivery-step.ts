import { OperatorAlerts } from '../../../src/app/alerts/operator-alerts.ts';
import { encryptToken } from '../../../src/app/channel-auth/token-cipher.ts';
import { runOutboundStep } from '../../../src/app/delivery/outbound-step.ts';
import { OffGroupNotices } from '../../../src/app/processing/off-group-notices.ts';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import type { Clock } from '../../../src/services/clock/clock.ts';
import type { SendResult } from '../../../src/services/messaging/messaging-channel.ts';
import type { Photo } from '../../../src/services/storage/photo-storage.ts';
import { MemoryPhotoStorage } from './memory-photo-storage.ts';
import { FIXED_NOW } from './seed-ids.ts';
import { StubMessagingChannel } from './stub-messaging-channel.ts';

const CLOCK: Clock = { now: () => FIXED_NOW };
const MADE_UP_ENCRYPTION_KEY = '0'.repeat(64);
const MAX_SENDS_PER_MINUTE = 100;
const AVAILABLE_BEFORE_NOW = new Date(FIXED_NOW.getTime() - 60_000);

export const OUTBOUND_RECIPIENT = { channel: 'zalo-oa', accountId: 'seed-oa', externalUserId: 'seed-zalo-admin-a' };
export const OUTBOUND_PHOTO_KEY = 'leak-test/outbound-photo.jpg';
const OUTBOUND_PHOTO: Photo = { bytes: Uint8Array.of(0xff, 0xd8, 0xff, 0xe0), contentType: 'image/jpeg' };

export type OutboundRow = { status: string; external_message_id: string | null };

export async function queueOutboundText(owner: PostgresPool, id: string): Promise<void> {
  await owner.query(
    `INSERT INTO outbound_messages (id, channel, account_id, external_user_id, kind, body, available_at)
     VALUES ($1, $2, $3, $4, 'text', 'SAFE-A-OUTBOUND-TEXT', $5)`,
    [id, OUTBOUND_RECIPIENT.channel, OUTBOUND_RECIPIENT.accountId, OUTBOUND_RECIPIENT.externalUserId, AVAILABLE_BEFORE_NOW],
  );
}

export async function queueOutboundImage(owner: PostgresPool, id: string): Promise<void> {
  await owner.query(
    `INSERT INTO outbound_messages (id, channel, account_id, external_user_id, kind, photo_key, available_at)
     VALUES ($1, $2, $3, $4, 'image', $5, $6)`,
    [id, OUTBOUND_RECIPIENT.channel, OUTBOUND_RECIPIENT.accountId, OUTBOUND_RECIPIENT.externalUserId, OUTBOUND_PHOTO_KEY, AVAILABLE_BEFORE_NOW],
  );
}

export async function runOutboundDeliveryStep(databases: { owner: PostgresPool; step: PostgresPool }, sendResult: SendResult): Promise<void> {
  await storeMadeUpAccessToken(databases.owner);
  const photoStorage = new MemoryPhotoStorage();
  await photoStorage.put(OUTBOUND_PHOTO_KEY, OUTBOUND_PHOTO);
  const outcome = await runOutboundStep({
    database: databases.step,
    clock: CLOCK,
    alerts: new OperatorAlerts({ notify: async () => {} }, CLOCK),
    notices: new OffGroupNotices(CLOCK, () => {}),
    channel: new AnsweringChannel(sendResult),
    photoStorage,
    encryptionKey: MADE_UP_ENCRYPTION_KEY,
    maxPerMinute: MAX_SENDS_PER_MINUTE,
    reportReadyTemplateId: null,
  });
  if (outcome !== 'processed') throw new Error('the outbound step found no queued message');
}

export async function readOutboundRow(owner: PostgresPool, id: string): Promise<OutboundRow> {
  const { rows } = await owner.query<OutboundRow>('SELECT status, external_message_id FROM outbound_messages WHERE id = $1', [id]);
  const [row] = rows;
  if (row === undefined) throw new Error(`outbound message ${id} does not exist`);
  return row;
}

async function storeMadeUpAccessToken(owner: PostgresPool): Promise<void> {
  await owner.query('UPDATE channel_connections SET access_token_encrypted = $1 WHERE channel = $2 AND account_id = $3', [
    encryptToken('made-up-access-token', MADE_UP_ENCRYPTION_KEY),
    OUTBOUND_RECIPIENT.channel,
    OUTBOUND_RECIPIENT.accountId,
  ]);
}

class AnsweringChannel extends StubMessagingChannel {
  private readonly answer: SendResult;

  constructor(answer: SendResult) {
    super();
    this.answer = answer;
  }

  override async sendText(): Promise<SendResult> {
    return this.answer;
  }

  override async sendImage(): Promise<SendResult> {
    return this.answer;
  }
}
