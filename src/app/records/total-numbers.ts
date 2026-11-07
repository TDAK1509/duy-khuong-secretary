import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { buildAccentFreeEquals, buildWhere, type RecordFilters } from './search-records.ts';
import { buildValidNumberPair } from './valid-number-pair.ts';

export const NUMBER_GROUPS = ['none', 'member', 'plate', 'category', 'occurred_on'] as const;

export type NumberGroup = (typeof NUMBER_GROUPS)[number];

export type NumberTotal = { group: string | null; unit: string; count: number; sum: string; min: string; max: string };

export type NumberTotals = { groups: NumberTotal[]; withoutNumber: number };

export type TotalRequest = { label: string; filters: RecordFilters; groupBy: NumberGroup };

type GroupKey = { id: string; name: string };

const DOCUMENT_DATE = `to_char(record.occurred_on, 'YYYY-MM-DD')`;

const LATEST_SENDER_NAME = 'first_value(record.sender_name) OVER (PARTITION BY record.user_id ORDER BY record.created_at DESC, record.id DESC)';

const GROUP_KEYS: Record<NumberGroup, GroupKey> = {
  none: { id: 'NULL::text', name: 'NULL::text' },
  member: { id: 'record.user_id::text', name: LATEST_SENDER_NAME },
  plate: { id: 'record.vehicle_plate', name: 'record.vehicle_plate' },
  category: { id: 'record.category', name: 'record.category' },
  occurred_on: { id: DOCUMENT_DATE, name: DOCUMENT_DATE },
};

type TotalRow = { group: string | null; unit: string | null; count: number; sum: string; min: string; max: string; without_number: number };

export async function totalNumbers(database: Database, scope: AccessScope, request: TotalRequest): Promise<NumberTotals> {
  const where = buildWhere(scope, request.filters);
  const recordSql = where.toSql();
  const labelMatch = buildAccentFreeEquals(where, `detail ->> 'label'`, request.label);
  const validNumberPair = buildValidNumberPair(where, 'detail');
  const sql = buildTotalSql({ groupBy: request.groupBy, recordSql, labelMatch, validNumberPair });
  const { rows } = await database.query<TotalRow>(sql, where.values);
  return { groups: rows.filter(hasGroup).map(toNumberTotal), withoutNumber: rows[0]?.without_number ?? 0 };
}

type TotalSqlParts = { groupBy: NumberGroup; recordSql: string; labelMatch: string; validNumberPair: string };

function buildTotalSql({ groupBy, recordSql, labelMatch, validNumberPair }: TotalSqlParts): string {
  const groupKey = GROUP_KEYS[groupBy];
  return `WITH matching AS (
      SELECT record.id, record.details, ${groupKey.id} AS group_id, ${groupKey.name} AS group_name
      FROM records record
      WHERE ${recordSql}
    ), labelled AS (
      SELECT matching.id AS record_id, matching.group_id, matching.group_name, detail ->> 'unit' AS unit,
        CASE WHEN ${validNumberPair} THEN (detail -> 'number')::numeric END AS amount
      FROM matching CROSS JOIN LATERAL jsonb_array_elements(matching.details) detail
      WHERE ${labelMatch}
    ), totals AS (
      SELECT group_id, group_name AS "group", unit, count(amount)::int AS count, sum(amount)::text AS sum,
        min(amount)::text AS min, max(amount)::text AS max
      FROM labelled
      WHERE amount IS NOT NULL
      GROUP BY group_id, group_name, unit
    ), missing AS (
      SELECT count(DISTINCT record_id)::int AS without_number FROM labelled WHERE amount IS NULL
    )
    SELECT totals."group", totals.unit, totals.count, totals.sum, totals.min, totals.max, missing.without_number
    FROM missing LEFT JOIN totals ON true
    ORDER BY totals."group" NULLS LAST, totals.unit, totals.group_id`;
}

function hasGroup(row: TotalRow): row is TotalRow & { unit: string } {
  return row.unit !== null;
}

function toNumberTotal(row: TotalRow & { unit: string }): NumberTotal {
  return { group: row.group, unit: row.unit, count: row.count, sum: row.sum, min: row.min, max: row.max };
}
