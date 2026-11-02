import { runInTransaction, type Database } from '../db/transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';

const FIRST_RETRY_WAIT_MS = 30_000;

export async function recordFailure(database: Database, event: ClaimedEvent, now: Date, error: unknown): Promise<void> {
  await runInTransaction(database, (transaction) =>
    transaction.query(`UPDATE inbound_events SET status = 'queued', available_at = $2, last_error = $3 WHERE id = $1`, [
      event.id,
      new Date(now.getTime() + waitBeforeRetryMs(event.attempts)),
      error instanceof Error ? error.name : 'unknown error',
    ]),
  );
}

function waitBeforeRetryMs(attempts: number): number {
  return FIRST_RETRY_WAIT_MS * 2 ** (attempts - 1);
}
