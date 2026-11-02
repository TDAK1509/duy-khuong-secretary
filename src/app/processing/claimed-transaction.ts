import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';

export class ClaimLostError extends Error {
  override name = 'ClaimLostError';
}

export function runInClaimedTransaction<Result>(
  database: Database,
  event: ClaimedEvent,
  work: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  return runInTransaction(database, async (transaction) => {
    await holdClaim(transaction, event);
    return work(transaction);
  });
}

async function holdClaim(transaction: Transaction, event: ClaimedEvent): Promise<void> {
  const rows = await transaction.query(
    `SELECT 1 FROM inbound_events WHERE id = $1 AND status = 'processing' AND attempts = $2 FOR UPDATE`,
    [event.id, event.attempts],
  );
  if (rows.length === 0) throw new ClaimLostError(`the claim on event ${event.id} was lost`);
}
