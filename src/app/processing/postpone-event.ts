import type { Clock } from '../../services/clock/clock.ts';
import type { Database } from '../db/transaction.ts';
import { runInClaimedTransaction } from './claimed-transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';
import type { OffGroupNotices } from './off-group-notices.ts';

const POSTPONE_MS = 60_000;

export type PostponeDependencies = { database: Database; clock: Clock; notices: OffGroupNotices };

export async function postponeEvent(dependencies: PostponeDependencies, event: ClaimedEvent, group: string): Promise<void> {
  const { database, clock, notices } = dependencies;
  await postponeEventUntil(database, event, new Date(clock.now().getTime() + POSTPONE_MS));
  notices.announce(group);
}

export async function postponeEventUntil(database: Database, event: ClaimedEvent, until: Date): Promise<void> {
  await runInClaimedTransaction(database, event, (transaction) =>
    transaction.query(
      `UPDATE inbound_events
       SET status = 'queued', available_at = $2, attempts = attempts - 1, locked_until = NULL
       WHERE id = $1`,
      [event.id, until],
    ),
  );
}
