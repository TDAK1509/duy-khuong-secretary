import type { Database } from '../db/transaction.ts';
import type { LlmCallKind } from '../credits/llm-call-kind.ts';

export type AdditionEntry = {
  type: 'addition';
  at: Date;
  time: string;
  source: 'starting_grant' | 'internal_user';
  credits: string;
  adder: string | null;
  note: string;
  balanceAfter: string;
};

export type UsageEntry = {
  type: 'usage';
  at: Date;
  day: string;
  kind: LlmCallKind;
  calls: number;
  credits: string;
  costUsd: string;
  balanceAfter: string | null;
};

export type HistoryEntry = AdditionEntry | UsageEntry;

type AdditionRow = {
  at: Date;
  time: string;
  source: AdditionEntry['source'];
  credits: string;
  adder: string | null;
  note: string;
  balance_after: string;
};

type UsageRow = { at: Date; day: string; kind: LlmCallKind; calls: string; credits: string; cost_usd: string; balance_after: string | null };

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const LAST_30_DAYS = `created_at >= $2::timestamptz - interval '30 days'`;

export async function readCreditHistory(database: Database, workspaceId: string, now: Date): Promise<HistoryEntry[]> {
  const [additions, usage] = await Promise.all([readAdditions(database, workspaceId, now), readUsage(database, workspaceId, now)]);
  return [...additions, ...usage].sort((first, second) => second.at.getTime() - first.at.getTime());
}

async function readAdditions(database: Database, workspaceId: string, now: Date): Promise<AdditionEntry[]> {
  const { rows } = await database.query<AdditionRow>(
    `SELECT created_at AS at, to_char(created_at AT TIME ZONE '${VIETNAM_TIME_ZONE}', 'DD/MM/YYYY HH24:MI') AS time,
       source, credits, note, balance_after,
       CASE WHEN added_by IS NULL THEN NULL ELSE coalesce(
         (SELECT display_name FROM memberships WHERE user_id = added_by ORDER BY created_at, id LIMIT 1), added_by::text) END AS adder
     FROM credit_additions WHERE workspace_id = $1 AND ${LAST_30_DAYS}`,
    [workspaceId, now],
  );
  return rows.map((row) => ({ type: 'addition', at: row.at, time: row.time, source: row.source, credits: row.credits, adder: row.adder, note: row.note, balanceAfter: row.balance_after }));
}

async function readUsage(database: Database, workspaceId: string, now: Date): Promise<UsageEntry[]> {
  const { rows } = await database.query<UsageRow>(
    `SELECT max(created_at) AS at, to_char(created_at AT TIME ZONE '${VIETNAM_TIME_ZONE}', 'DD/MM/YYYY') AS day, kind,
       count(*) AS calls, sum(credits) AS credits, sum(cost_usd) AS cost_usd,
       (array_agg(balance_after ORDER BY created_at DESC, id DESC))[1] AS balance_after
     FROM llm_calls WHERE workspace_id = $1 AND ${LAST_30_DAYS}
     GROUP BY day, kind`,
    [workspaceId, now],
  );
  return rows.map((row) => ({ type: 'usage', at: row.at, day: row.day, kind: row.kind, calls: Number(row.calls), credits: row.credits, costUsd: row.cost_usd, balanceAfter: row.balance_after }));
}
