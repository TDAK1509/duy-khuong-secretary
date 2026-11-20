import { describeInboundEventFailed } from '../alerts/alert-texts.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import type { Database } from '../db/transaction.ts';
import { describeError } from '../errors/describe-error.ts';
import { runInClaimedTransaction } from './claimed-transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';

export const MAX_ATTEMPTS = 5;
const FIRST_RETRY_WAIT_MS = 30_000;

export type FailureDependencies = { database: Database; alerts: OperatorAlerts };

export async function recordFailure(
  dependencies: FailureDependencies,
  event: ClaimedEvent,
  now: Date,
  error: unknown,
): Promise<void> {
  const errorDescription = describeError(error);
  if (event.attempts < MAX_ATTEMPTS) {
    await requeueWithWait(dependencies.database, event, now, errorDescription);
    return;
  }
  await markFailed(dependencies.database, event, errorDescription);
  await dependencies.alerts.raise(describeInboundEventFailed(event.id, event.attempts, errorDescription));
}

export async function failExhaustedEvent(dependencies: FailureDependencies, event: ClaimedEvent): Promise<void> {
  const errorName = 'LockExpired';
  await runInClaimedTransaction(dependencies.database, event, (transaction) =>
    transaction.query(
      `UPDATE inbound_events SET status = 'failed', attempts = attempts - 1, last_error = $2, locked_until = NULL WHERE id = $1`,
      [event.id, errorName],
    ),
  );
  await dependencies.alerts.raise(describeInboundEventFailed(event.id, MAX_ATTEMPTS, errorName));
}

async function requeueWithWait(database: Database, event: ClaimedEvent, now: Date, errorDescription: string): Promise<void> {
  const availableAt = new Date(now.getTime() + FIRST_RETRY_WAIT_MS * 2 ** (event.attempts - 1));
  await runInClaimedTransaction(database, event, (transaction) =>
    transaction.query(`UPDATE inbound_events SET status = 'queued', available_at = $2, last_error = $3, locked_until = NULL WHERE id = $1`, [
      event.id,
      availableAt,
      errorDescription,
    ]),
  );
}

async function markFailed(database: Database, event: ClaimedEvent, errorDescription: string): Promise<void> {
  await runInClaimedTransaction(database, event, (transaction) =>
    transaction.query(`UPDATE inbound_events SET status = 'failed', last_error = $2, locked_until = NULL WHERE id = $1`, [event.id, errorDescription]),
  );
}
