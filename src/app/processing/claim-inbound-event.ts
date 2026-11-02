import { runInTransaction, type Database } from '../db/transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';

type ClaimedRow = {
  id: string;
  channel: string;
  account_id: string;
  external_user_id: string;
  kind: 'text' | 'images';
  payload: Record<string, unknown>;
  attempts: number;
};

export async function claimInboundEvent(database: Database, now: Date): Promise<ClaimedEvent | null> {
  const [row] = await runInTransaction(database, (transaction) =>
    transaction.query<ClaimedRow>(
      `WITH candidate AS (
         SELECT id FROM inbound_events
         WHERE ((status = 'queued' AND available_at <= $1) OR (status = 'processing' AND locked_until < $1))
           AND NOT EXISTS (
             SELECT 1 FROM inbound_events earlier
             WHERE earlier.channel = inbound_events.channel
               AND earlier.account_id = inbound_events.account_id
               AND earlier.external_user_id = inbound_events.external_user_id
               AND earlier.status IN ('queued', 'processing')
               AND (earlier.received_at, earlier.id) < (inbound_events.received_at, inbound_events.id)
           )
         ORDER BY received_at, id
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE inbound_events
       SET status = 'processing', locked_until = $1 + interval '5 minutes', attempts = attempts + 1
       FROM candidate
       WHERE inbound_events.id = candidate.id
       RETURNING inbound_events.id, channel, account_id, external_user_id, kind, payload, attempts`,
      [now],
    ),
  );
  return row ? describeClaim(row) : null;
}

function describeClaim(row: ClaimedRow): ClaimedEvent {
  return {
    id: row.id,
    channel: row.channel,
    accountId: row.account_id,
    externalUserId: row.external_user_id,
    kind: row.kind,
    payload: row.payload,
    attempts: row.attempts,
  };
}
