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

export async function claimInboundEvent(database: Database): Promise<ClaimedEvent | null> {
  const [row] = await runInTransaction(database, (transaction) =>
    transaction.query<ClaimedRow>(
      `WITH candidate AS (
         SELECT id FROM inbound_events
         WHERE status = 'queued'
         ORDER BY received_at, id
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE inbound_events
       SET status = 'processing', attempts = attempts + 1
       FROM candidate
       WHERE inbound_events.id = candidate.id
       RETURNING inbound_events.id, channel, account_id, external_user_id, kind, payload, attempts`,
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
