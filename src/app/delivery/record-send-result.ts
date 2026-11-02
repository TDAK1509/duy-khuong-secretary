import type { SendResult } from '../../services/messaging/messaging-channel.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import type { ClaimedMessage } from './claimed-message.ts';
import { lockRecipientInWindow } from './is-recipient-in-window.ts';
import { enqueueReportReadyTemplate } from './enqueue-report-ready-template.ts';
import { storeOfferedChoice } from './store-offered-choice.ts';
import { decideSendOutcome, type SendOutcome, type Settlement } from './decide-send-outcome.ts';

export type ResultDependencies = {
  database: Database;
  clock: Clock;
  alerts: OperatorAlerts;
  reportReadyTemplateId: string | null;
};

export async function recordSendResult(
  dependencies: ResultDependencies,
  message: ClaimedMessage,
  result: SendResult,
): Promise<void> {
  await applyOutcome(dependencies, message, decideSendOutcome(message, result, dependencies.clock.now()));
}

export async function applyOutcome(
  dependencies: ResultDependencies,
  message: ClaimedMessage,
  outcome: SendOutcome,
): Promise<void> {
  const { alerts } = dependencies;
  const isSettled = await settleMessage(dependencies, message, outcome.settlement);
  if (!isSettled) return;
  if (outcome.settlement.status === 'failed') console.error(`[outbound] message ${message.id} failed: ${outcome.settlement.lastError}`);
  if (outcome.alert) await alerts.raise(outcome.alert);
}

async function settleMessage(
  { database, clock, reportReadyTemplateId }: ResultDependencies,
  message: ClaimedMessage,
  settlement: Settlement,
): Promise<boolean> {
  const isSettled = await runInTransaction(database, async (transaction) => {
    const decided = await confirmSettlement(transaction, message, settlement, clock.now());
    const settled = await updateMessage(transaction, message, decided);
    if (settled && decided.status === 'sent') await storeOfferedChoice(transaction, message.id);
    if (settled && decided.status === 'held' && reportReadyTemplateId !== null) {
      await enqueueReportReadyTemplate(transaction, message, { templateId: reportReadyTemplateId, now: clock.now() });
    }
    return settled;
  });
  if (!isSettled) {
    console.error(`[outbound] ignored a result for message ${message.id}: the claim was lost`);
  }
  return isSettled;
}

async function confirmSettlement(
  transaction: Transaction,
  message: ClaimedMessage,
  settlement: Settlement,
  now: Date,
): Promise<Settlement> {
  if (!settlement.recheckWindow) return settlement;
  const isInWindow = await lockRecipientInWindow(transaction, message.to, now);
  return isInWindow ? { status: 'queued', availableAt: now, lastError: 'window_reopened' } : settlement;
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
