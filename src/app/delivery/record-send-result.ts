import type { SendResult } from '../../services/messaging/messaging-channel.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { Database } from '../db/transaction.ts';
import type { ClaimedMessage } from './claimed-message.ts';

const RATE_LIMIT_WAIT_MS = 60_000;

export type ResultDependencies = { database: Database; clock: Clock };

type Settlement = {
  status: 'sent' | 'queued' | 'failed' | 'unknown';
  availableAt?: Date;
  sentAt?: Date;
  lastError?: string;
};

export async function recordSendResult(
  dependencies: ResultDependencies,
  message: ClaimedMessage,
  result: SendResult,
): Promise<void> {
  const now = dependencies.clock.now();
  if (result.ok) {
    await settleMessage(dependencies.database, message, { status: 'sent', sentAt: now });
    return;
  }
  await settleMessage(dependencies.database, message, {
    status: 'queued',
    availableAt: new Date(now.getTime() + RATE_LIMIT_WAIT_MS),
    lastError: result.reason,
  });
}

async function settleMessage(database: Database, message: ClaimedMessage, settlement: Settlement): Promise<boolean> {
  const settled = await database.query(
    `UPDATE outbound_messages
     SET status = $3, available_at = COALESCE($4, available_at), sent_at = COALESCE($5, sent_at),
         last_error = $6, locked_until = NULL
     WHERE id = $1 AND status = 'sending' AND attempts = $2`,
    [
      message.id,
      message.attempts,
      settlement.status,
      settlement.availableAt ?? null,
      settlement.sentAt ?? null,
      settlement.lastError ?? null,
    ],
  );
  if (settled.rowCount === 0) {
    console.error(`[outbound] ignored a result for message ${message.id}: the claim was lost`);
  }
  return settled.rowCount !== 0;
}
