import { describeInboundEventFailed } from '../alerts/alert-texts.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import type { Database } from '../db/transaction.ts';
import { runInClaimedTransaction } from './claimed-transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';

const MAX_ATTEMPTS = 5;
const FIRST_RETRY_WAIT_MS = 30_000;

export type FailureDependencies = { database: Database; alerts: OperatorAlerts };

export async function recordFailure(
  dependencies: FailureDependencies,
  event: ClaimedEvent,
  now: Date,
  error: unknown,
): Promise<void> {
  const errorName = error instanceof Error ? error.name : 'unknown error';
  if (event.attempts < MAX_ATTEMPTS) {
    await requeueWithWait(dependencies.database, event, now, errorName);
    return;
  }
  await markFailed(dependencies.database, event, errorName);
  await dependencies.alerts.raise(describeInboundEventFailed(event.id, event.attempts, errorName));
}

async function requeueWithWait(database: Database, event: ClaimedEvent, now: Date, errorName: string): Promise<void> {
  const availableAt = new Date(now.getTime() + FIRST_RETRY_WAIT_MS * 2 ** (event.attempts - 1));
  await runInClaimedTransaction(database, event, (transaction) =>
    transaction.query(`UPDATE inbound_events SET status = 'queued', available_at = $2, last_error = $3, locked_until = NULL WHERE id = $1`, [
      event.id,
      availableAt,
      errorName,
    ]),
  );
}

async function markFailed(database: Database, event: ClaimedEvent, errorName: string): Promise<void> {
  await runInClaimedTransaction(database, event, (transaction) =>
    transaction.query(`UPDATE inbound_events SET status = 'failed', last_error = $2, locked_until = NULL WHERE id = $1`, [event.id, errorName]),
  );
}
