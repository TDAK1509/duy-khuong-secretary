import type { TokenUsage } from '../../services/usage/token-usage.ts';
import { runInTransaction, type Database } from '../db/transaction.ts';
import { chargeCall } from './credit-balance.ts';
import type { LlmCallKind } from './llm-call-kind.ts';
import { priceCall, type PricedCall } from './price-call.ts';

export type CallMeter = { database: Database; workspaceId: string; isCharged: boolean };

export type FinishedCall = { kind: LlmCallKind; model: string; usage: TokenUsage | null };

const FREE_CALL: PricedCall = { costUsd: '0.000000000', credits: '0.000' };

export function recordCall(meter: CallMeter, { kind, model, usage }: FinishedCall): Promise<void> {
  const price = usage === null ? FREE_CALL : priceCall(model, usage);
  return runInTransaction(meter.database, (transaction) =>
    chargeCall(transaction, { workspaceId: meter.workspaceId, kind, model, usage, price, isCharged: meter.isCharged }),
  );
}
