import type { SendResult } from '../../services/messaging/messaging-channel.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import type { ClaimedMessage } from './claimed-message.ts';
import { storeOfferedChoice } from './store-offered-choice.ts';
import { decideSendOutcome, type SendOutcome, type Settlement } from './decide-send-outcome.ts';

export type ResultDependencies = { database: Database; clock: Clock; alerts: OperatorAlerts };

export async function recordSendResult(
  dependencies: ResultDependencies,
  message: ClaimedMessage,
  result: SendResult,
): Promise<void> {
  await applyOutcome(dependencies, message, decideSendOutcome(message, result, dependencies.clock.now()));
}

export async function applyOutcome(
  { database, alerts }: ResultDependencies,
  message: ClaimedMessage,
  outcome: SendOutcome,
): Promise<void> {
  const isSettled = await settleMessage(database, message, outcome.settlement);
  if (!isSettled) return;
  if (outcome.settlement.status === 'failed') console.error(`[outbound] message ${message.id} failed: ${outcome.settlement.lastError}`);
  if (outcome.alert) await alerts.raise(outcome.alert);
}

async function settleMessage(database: Database, message: ClaimedMessage, settlement: Settlement): Promise<boolean> {
  const isSettled = await runInTransaction(database, async (transaction) => {
    const settled = await updateMessage(transaction, message, settlement);
    if (settled && settlement.status === 'sent') await storeOfferedChoice(transaction, message.id);
    return settled;
  });
  if (!isSettled) {
    console.error(`[outbound] ignored a result for message ${message.id}: the claim was lost`);
  }
  return isSettled;
}

async function updateMessage(transaction: Transaction, message: ClaimedMessage, settlement: Settlement): Promise<boolean> {
  const settled = await transaction.query(
    `UPDATE outbound_messages
     SET status = $3, available_at = COALESCE($4, available_at), sent_at = COALESCE($5, sent_at),
         last_error = $6, locked_until = NULL
     WHERE id = $1 AND status = 'sending' AND attempts = $2
     RETURNING id`,
    [
      message.id,
      message.attempts,
      settlement.status,
      settlement.availableAt ?? null,
      settlement.sentAt ?? null,
      settlement.lastError ?? null,
    ],
  );
  return settled.length !== 0;
}
