import type { Database } from '../db/transaction.ts';
import type { ClaimedMessage } from './claimed-message.ts';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SAFETY_MARGIN_MS = 10 * 60 * 1000;

export async function isRecipientInWindow(database: Database, message: ClaimedMessage, now: Date): Promise<boolean> {
  const { rows } = await database.query<{ last_inbound_at: Date }>(
    `SELECT last_inbound_at FROM channel_identities WHERE channel = $1 AND account_id = $2 AND external_user_id = $3`,
    [message.to.channel, message.to.accountId, message.to.externalUserId],
  );
  const [identity] = rows;
  return identity !== undefined && identity.last_inbound_at.getTime() > now.getTime() - WINDOW_MS + SAFETY_MARGIN_MS;
}
