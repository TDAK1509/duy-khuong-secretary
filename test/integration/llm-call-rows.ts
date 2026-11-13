import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type LlmCallRow = {
  kind: string;
  model: string;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string;
  credits: string;
  balance_after: string | null;
};

export function listLlmCalls(database: TemporaryDatabase, workspaceId: string): Promise<LlmCallRow[]> {
  return database.query<LlmCallRow>(
    `SELECT kind, model, input_tokens, cached_input_tokens, cache_write_tokens, output_tokens, cost_usd, credits, balance_after
     FROM llm_calls WHERE workspace_id = ${literal(workspaceId)} ORDER BY created_at, id`,
  );
}

export async function setCreditBalance(database: TemporaryDatabase, workspaceId: string, credits: number): Promise<void> {
  await database.query(`UPDATE workspaces SET credit_balance = ${credits} WHERE id = ${literal(workspaceId)}`);
}

export async function readCreditBalance(database: TemporaryDatabase, workspaceId: string): Promise<string> {
  const [row] = await database.query<{ credit_balance: string }>(
    `SELECT credit_balance FROM workspaces WHERE id = ${literal(workspaceId)}`,
  );
  if (!row) throw new Error('workspace not found');
  return row.credit_balance;
}
