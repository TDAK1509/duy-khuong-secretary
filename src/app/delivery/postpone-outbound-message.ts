import { runInTransaction } from '../db/transaction.ts';
import type { ClaimedMessage } from './claimed-message.ts';
import type { OutboundDependencies } from './outbound-step.ts';

const POSTPONE_MS = 60_000;

export async function postponeOutboundMessage(
  { database, clock, notices }: OutboundDependencies,
  message: ClaimedMessage,
  group: string,
): Promise<void> {
  await runInTransaction(database, (transaction) =>
    transaction.query(
      `UPDATE outbound_messages
       SET status = 'queued', available_at = $3, attempts = attempts - 1, locked_until = NULL
       WHERE id = $1 AND status = 'sending' AND attempts = $2`,
      [message.id, message.attempts, new Date(clock.now().getTime() + POSTPONE_MS)],
    ),
  );
  notices.announce(group);
}
