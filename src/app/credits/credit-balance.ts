import type { TokenUsage } from '../../services/usage/token-usage.ts';
import type { Transaction } from '../db/transaction.ts';
import type { LlmCallKind } from './llm-call-kind.ts';
import type { PricedCall } from './price-call.ts';

export type RecordedCall = {
  workspaceId: string;
  kind: LlmCallKind;
  model: string;
  usage: TokenUsage | null;
  price: PricedCall;
  isCharged: boolean;
};

export type CreditAddition = {
  workspaceId: string;
  credits: string;
  source: 'starting_grant' | 'internal_user';
  addedBy: string | null;
  note: string;
};

const NO_CREDITS = '0.000';

export async function chargeCall(transaction: Transaction, call: RecordedCall): Promise<void> {
  const credits = call.isCharged ? call.price.credits : NO_CREDITS;
  const balanceAfter = call.isCharged ? await lowerBalance(transaction, call.workspaceId, credits) : null;
  await transaction.query(
    `INSERT INTO llm_calls (workspace_id, kind, model, input_tokens, cached_input_tokens, cache_write_tokens, output_tokens, cost_usd, credits, balance_after)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      call.workspaceId,
      call.kind,
      call.model,
      call.usage?.input ?? null,
      call.usage?.cachedInput ?? null,
      call.usage?.cacheWrite ?? null,
      call.usage?.output ?? null,
      call.price.costUsd,
      credits,
      balanceAfter,
    ],
  );
}

export async function addCredits(transaction: Transaction, addition: CreditAddition): Promise<void> {
  const balanceAfter = await raiseBalance(transaction, addition.workspaceId, addition.credits);
  await transaction.query(
    `INSERT INTO credit_additions (workspace_id, credits, source, added_by, note, balance_after)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [addition.workspaceId, addition.credits, addition.source, addition.addedBy, addition.note, balanceAfter],
  );
}

function lowerBalance(transaction: Transaction, workspaceId: string, credits: string): Promise<string> {
  return changeBalance(transaction, workspaceId, `credit_balance - $2::numeric`, credits);
}

function raiseBalance(transaction: Transaction, workspaceId: string, credits: string): Promise<string> {
  return changeBalance(transaction, workspaceId, `credit_balance + $2::numeric`, credits);
}

async function changeBalance(transaction: Transaction, workspaceId: string, newBalance: string, credits: string): Promise<string> {
  const [row] = await transaction.query<{ credit_balance: string }>(
    `UPDATE workspaces SET credit_balance = ${newBalance} WHERE id = $1 RETURNING credit_balance`,
    [workspaceId, credits],
  );
  if (!row) throw new Error(`Workspace ${workspaceId} has no credit balance to change`);
  return row.credit_balance;
}
