import type { TokenUsage } from '../../services/usage/token-usage.ts';
import type { Transaction } from '../db/transaction.ts';
import type { ChargeSetting } from './charge-setting.ts';
import type { LlmCallKind } from './llm-call-kind.ts';
import { notifyAdminsOfNoCredits } from './notify-admins-of-no-credits.ts';
import type { PricedCall } from './price-call.ts';

export type RecordedCall = {
  workspaceId: string;
  kind: LlmCallKind;
  model: string;
  usage: TokenUsage | null;
  price: PricedCall;
  charged: ChargeSetting | null;
};

export type CreditAddition = {
  workspaceId: string;
  credits: string;
  source: 'starting_grant' | 'internal_user';
  addedBy: string | null;
  note: string;
};

const NO_CREDITS = '0.000';

const INSERT_CALL = `
  INSERT INTO llm_calls (workspace_id, kind, model, input_tokens, cached_input_tokens, cache_write_tokens, output_tokens, cost_usd, credits, balance_after)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

export async function chargeCall(transaction: Transaction, call: RecordedCall): Promise<void> {
  const { charged } = call;
  if (charged === null) return insertCall(transaction, call, { credits: NO_CREDITS, balanceAfter: null });
  const credits = call.price.credits;
  const balanceAfter = await lowerBalance(transaction, call.workspaceId, credits);
  await insertCall(transaction, call, { credits, balanceAfter });
  if (hasCrossedZero(balanceAfter, credits)) await notifyAdminsOfNoCredits(transaction, call.workspaceId, charged);
}

function hasCrossedZero(balanceAfter: string, credits: string): boolean {
  const after = toThousandths(balanceAfter);
  return after <= 0n && after + toThousandths(credits) > 0n;
}

function toThousandths(credits: string): bigint {
  return BigInt(credits.replace('.', ''));
}

async function insertCall(transaction: Transaction, call: RecordedCall, charge: { credits: string; balanceAfter: string | null }): Promise<void> {
  const tokenCounts = listTokenCounts(call.usage);
  await transaction.query(INSERT_CALL, [call.workspaceId, call.kind, call.model, ...tokenCounts, call.price.costUsd, charge.credits, charge.balanceAfter]);
}

function lowerBalance(transaction: Transaction, workspaceId: string, credits: string): Promise<string> {
  return changeBalance(transaction, workspaceId, `credit_balance - $2::numeric`, credits);
}

async function changeBalance(transaction: Transaction, workspaceId: string, newBalance: string, credits: string): Promise<string> {
  const [row] = await transaction.query<{ credit_balance: string }>(
    `UPDATE workspaces SET credit_balance = ${newBalance} WHERE id = $1 RETURNING credit_balance`,
    [workspaceId, credits],
  );
  if (!row) throw new Error(`Workspace ${workspaceId} has no credit balance to change`);
  return row.credit_balance;
}

function listTokenCounts(usage: TokenUsage | null): (number | null)[] {
  return [usage?.input ?? null, usage?.cachedInput ?? null, usage?.cacheWrite ?? null, usage?.output ?? null];
}

export async function addCredits(transaction: Transaction, addition: CreditAddition): Promise<void> {
  const balanceAfter = await raiseBalance(transaction, addition.workspaceId, addition.credits);
  await transaction.query(
    `INSERT INTO credit_additions (workspace_id, credits, source, added_by, note, balance_after)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [addition.workspaceId, addition.credits, addition.source, addition.addedBy, addition.note, balanceAfter],
  );
}

function raiseBalance(transaction: Transaction, workspaceId: string, credits: string): Promise<string> {
  return changeBalance(transaction, workspaceId, `credit_balance + $2::numeric`, credits);
}
