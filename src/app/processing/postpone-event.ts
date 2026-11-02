import { runInTransaction, type Database } from '../db/transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';

const POSTPONE_MS = 60_000;

export async function postponeEvent(database: Database, event: ClaimedEvent, now: Date): Promise<void> {
  await runInTransaction(database, (transaction) =>
    transaction.query(
      `UPDATE inbound_events
       SET status = 'queued', available_at = $2, attempts = attempts - 1, locked_until = NULL
       WHERE id = $1`,
      [event.id, new Date(now.getTime() + POSTPONE_MS)],
    ),
  );
}
