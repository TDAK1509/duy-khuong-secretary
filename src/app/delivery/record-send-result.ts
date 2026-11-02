import type { SendResult } from '../../services/messaging/messaging-channel.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import type { Database } from '../db/transaction.ts';
import type { ClaimedMessage } from './claimed-message.ts';
import { decideSendOutcome, type Settlement } from './decide-send-outcome.ts';

export type ResultDependencies = { database: Database; clock: Clock; alerts: OperatorAlerts };

export async function recordSendResult(
  dependencies: ResultDependencies,
  message: ClaimedMessage,
  result: SendResult,
): Promise<void> {
  const { database, clock, alerts } = dependencies;
  const outcome = decideSendOutcome(message, result, clock.now());
  const isSettled = await settleMessage(database, message, outcome.settlement);
  if (!isSettled) return;
  if (outcome.settlement.status === 'failed') console.error(`[outbound] message ${message.id} failed: ${outcome.settlement.lastError}`);
  if (outcome.alert) await alerts.raise(outcome.alert);
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
