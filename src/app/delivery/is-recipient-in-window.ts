import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';
import type { Database, Transaction } from '../db/transaction.ts';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SAFETY_MARGIN_MS = 10 * 60 * 1000;

const SELECT_LAST_INBOUND_AT = `SELECT last_inbound_at FROM channel_identities
  WHERE channel = $1 AND account_id = $2 AND external_user_id = $3`;

export async function isRecipientInWindow(database: Database, to: ChannelRecipient, now: Date): Promise<boolean> {
  const { rows } = await database.query<{ last_inbound_at: Date }>(SELECT_LAST_INBOUND_AT, listKey(to));
  return isWithinWindow(rows[0]?.last_inbound_at, now);
}

export async function lockRecipientInWindow(transaction: Transaction, to: ChannelRecipient, now: Date): Promise<boolean> {
  const rows = await transaction.query<{ last_inbound_at: Date }>(`${SELECT_LAST_INBOUND_AT} FOR UPDATE`, listKey(to));
  return isWithinWindow(rows[0]?.last_inbound_at, now);
}

function listKey(to: ChannelRecipient): string[] {
  return [to.channel, to.accountId, to.externalUserId];
}

function isWithinWindow(lastInboundAt: Date | undefined, now: Date): boolean {
  return lastInboundAt !== undefined && lastInboundAt.getTime() > now.getTime() - WINDOW_MS + SAFETY_MARGIN_MS;
}
