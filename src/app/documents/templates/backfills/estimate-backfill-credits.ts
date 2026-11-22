import type { Transaction } from '../../../db/transaction.ts';

export type CreditRange = { min: number; max: number };

const RECENT_PHOTO_READS = 50;

const ESTIMATE_SQL = `
  WITH recent AS (
    SELECT model, credits FROM llm_calls
    WHERE workspace_id = $1 AND kind = 'photo_read' AND credits > 0
    ORDER BY created_at DESC, id DESC
    LIMIT ${RECENT_PHOTO_READS}
  ), read_model AS (
    SELECT model FROM recent ORDER BY credits DESC LIMIT 1
  )
  SELECT min(credits) FILTER (WHERE model = (SELECT model FROM read_model))::float8 AS read_min,
    max(credits) FILTER (WHERE model = (SELECT model FROM read_model))::float8 AS read_max,
    coalesce(avg(credits) FILTER (WHERE model <> (SELECT model FROM read_model)), 0)::float8 AS pick_average
  FROM recent`;

type EstimateRow = { read_min: number | null; read_max: number | null; pick_average: number };

export async function findCreditRangePerPaper(transaction: Transaction, workspaceId: string): Promise<CreditRange | null> {
  const [row] = await transaction.query<EstimateRow>(ESTIMATE_SQL, [workspaceId]);
  if (row === undefined || row.read_min === null || row.read_max === null) return null;
  return { min: row.read_min + row.pick_average, max: row.read_max + row.pick_average };
}

export function estimateCredits(perPaper: CreditRange | null, paperCount: number): CreditRange | null {
  if (perPaper === null || paperCount === 0) return null;
  return { min: Math.floor(perPaper.min * paperCount), max: Math.ceil(perPaper.max * paperCount) };
}
