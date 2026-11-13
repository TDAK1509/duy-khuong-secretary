import type { Database } from '../db/transaction.ts';
import type { Usage } from './format-credits.ts';

export type WorkspaceOverview = { id: string; name: string; balance: string; hasDrifted: boolean; today: Usage; lastWeek: Usage; lastMonth: Usage };

type OverviewRow = {
  id: string;
  name: string;
  credit_balance: string;
  has_drifted: boolean;
  today_credits: string;
  today_cost: string;
  week_credits: string;
  week_cost: string;
  month_credits: string;
  month_cost: string;
};

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const OVERVIEW_QUERY = `
  WITH windows AS (
    SELECT date_trunc('day', $1::timestamptz AT TIME ZONE '${VIETNAM_TIME_ZONE}') AT TIME ZONE '${VIETNAM_TIME_ZONE}' AS today_start,
           $1::timestamptz - interval '7 days' AS week_start,
           $1::timestamptz - interval '30 days' AS month_start
  )
  SELECT workspace.id, workspace.name, workspace.credit_balance,
    workspace.credit_balance IS DISTINCT FROM (
      coalesce((SELECT sum(credits) FROM credit_additions WHERE workspace_id = workspace.id), 0)
      - coalesce((SELECT sum(credits) FROM llm_calls WHERE workspace_id = workspace.id), 0)
    ) AS has_drifted,
    coalesce(sum(call.credits) FILTER (WHERE call.created_at >= windows.today_start), 0) AS today_credits,
    coalesce(sum(call.cost_usd) FILTER (WHERE call.created_at >= windows.today_start), 0) AS today_cost,
    coalesce(sum(call.credits) FILTER (WHERE call.created_at >= windows.week_start), 0) AS week_credits,
    coalesce(sum(call.cost_usd) FILTER (WHERE call.created_at >= windows.week_start), 0) AS week_cost,
    coalesce(sum(call.credits), 0) AS month_credits,
    coalesce(sum(call.cost_usd), 0) AS month_cost
  FROM workspaces workspace
  CROSS JOIN windows
  LEFT JOIN llm_calls call ON call.workspace_id = workspace.id AND call.created_at >= windows.month_start
  GROUP BY workspace.id, workspace.name, workspace.credit_balance
  ORDER BY workspace.name, workspace.id`;

export async function readWorkspaceOverview(database: Database, now: Date): Promise<WorkspaceOverview[]> {
  const { rows } = await database.query<OverviewRow>(OVERVIEW_QUERY, [now]);
  return rows.map(describeOverviewRow);
}

function describeOverviewRow(row: OverviewRow): WorkspaceOverview {
  return {
    id: row.id,
    name: row.name,
    balance: row.credit_balance,
    hasDrifted: row.has_drifted,
    today: { credits: row.today_credits, costUsd: row.today_cost },
    lastWeek: { credits: row.week_credits, costUsd: row.week_cost },
    lastMonth: { credits: row.month_credits, costUsd: row.month_cost },
  };
}
