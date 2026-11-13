import type { Database } from '../db/transaction.ts';
import type { LlmCallKind } from '../credits/llm-call-kind.ts';

export type KindUsage = { workspaceName: string; kind: LlmCallKind; calls: number; credits: string; costUsd: string };

type KindUsageRow = { name: string; kind: LlmCallKind; calls: string; credits: string; cost_usd: string };

export async function readUsageByKind(database: Database, now: Date): Promise<KindUsage[]> {
  const { rows } = await database.query<KindUsageRow>(
    `SELECT workspace.name, call.kind, count(*) AS calls, sum(call.credits) AS credits, sum(call.cost_usd) AS cost_usd
     FROM llm_calls call
     JOIN workspaces workspace ON workspace.id = call.workspace_id
     WHERE call.created_at >= $1::timestamptz - interval '7 days' AND call.created_at <= $1
     GROUP BY workspace.id, workspace.name, call.kind
     ORDER BY workspace.name, workspace.id, call.kind`,
    [now],
  );
  return rows.map((row) => ({ workspaceName: row.name, kind: row.kind, calls: Number(row.calls), credits: row.credits, costUsd: row.cost_usd }));
}
