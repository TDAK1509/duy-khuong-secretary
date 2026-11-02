import type { Database } from '../db/transaction.ts';
import type { ClaimedMessage } from './claimed-message.ts';

const LOCK_MS = 2 * 60 * 1000;

type ClaimedRow = {
  id: string;
  channel: string;
  account_id: string;
  external_user_id: string;
  body: string;
  admin_membership_id: string | null;
  attempts: number;
};

export async function claimOutboundMessage(database: Database, now: Date): Promise<ClaimedMessage | null> {
  const { rows } = await database.query<ClaimedRow>(
    `WITH candidate AS (
       SELECT id FROM outbound_messages
       WHERE status = 'queued' AND kind = 'text' AND available_at <= $1
         AND NOT EXISTS (
           SELECT 1 FROM outbound_messages earlier
           WHERE earlier.channel = outbound_messages.channel
             AND earlier.account_id = outbound_messages.account_id
             AND earlier.external_user_id = outbound_messages.external_user_id
             AND earlier.status IN ('queued', 'sending')
             AND earlier.seq < outbound_messages.seq
         )
       ORDER BY seq
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE outbound_messages
     SET status = 'sending', locked_until = $2, attempts = attempts + 1
     FROM candidate
     WHERE outbound_messages.id = candidate.id
     RETURNING outbound_messages.id, channel, account_id, external_user_id, body, admin_membership_id, attempts`,
    [now, new Date(now.getTime() + LOCK_MS)],
  );
  const [row] = rows;
  return row ? describeClaim(row) : null;
}

function describeClaim(row: ClaimedRow): ClaimedMessage {
  return {
    id: row.id,
    to: { channel: row.channel, accountId: row.account_id, externalUserId: row.external_user_id },
    body: row.body,
    adminMembershipId: row.admin_membership_id,
    attempts: row.attempts,
  };
}
