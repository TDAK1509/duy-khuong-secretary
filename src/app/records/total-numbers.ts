import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { buildAccentFreeEquals, buildWhere, type RecordFilters } from './search-records.ts';

export const NUMBER_GROUPS = ['none', 'member', 'plate', 'category', 'occurred_on'] as const;

export type NumberGroup = (typeof NUMBER_GROUPS)[number];

export type NumberTotal = { group: string | null; unit: string; count: number; sum: string; min: string; max: string };

export type NumberTotals = { groups: NumberTotal[]; withoutNumber: number };

export type TotalRequest = { label: string; filters: RecordFilters; groupBy: NumberGroup };

export async function totalNumbers(database: Database, scope: AccessScope, request: TotalRequest): Promise<NumberTotals> {
  const where = buildWhere(scope, request.filters);
  const recordSql = where.toSql();
  const labelMatch = buildAccentFreeEquals(where, `detail ->> 'label'`, request.label);
  const { rows } = await database.query<NumberTotal>(buildTotalSql(request.groupBy, recordSql, labelMatch), where.values);
  return { groups: rows, withoutNumber: 0 };
}

function buildTotalSql(groupBy: NumberGroup, recordSql: string, labelMatch: string): string {
  const groupKey = buildGroupKey(groupBy);
  return `WITH matching AS (
      SELECT record.details, ${groupKey.id} AS group_id, ${groupKey.name} AS group_name
      FROM records record
      WHERE ${recordSql}
    ), labelled AS (
      SELECT matching.group_id, matching.group_name, detail ->> 'unit' AS unit, (detail -> 'number')::numeric AS amount
      FROM matching CROSS JOIN LATERAL jsonb_array_elements(matching.details) detail
      WHERE ${labelMatch}
    )
    SELECT group_name AS "group", unit, count(amount)::int AS count, sum(amount)::text AS sum, min(amount)::text AS min, max(amount)::text AS max
    FROM labelled
    GROUP BY group_id, group_name, unit
    ORDER BY group_name NULLS LAST, unit, group_id`;
}

function buildGroupKey(groupBy: NumberGroup): { id: string; name: string } {
  if (groupBy === 'member') {
    return {
      id: 'record.user_id::text',
      name: 'first_value(record.sender_name) OVER (PARTITION BY record.user_id ORDER BY record.created_at DESC, record.id DESC)',
    };
  }
  if (groupBy === 'plate') return { id: 'record.vehicle_plate', name: 'record.vehicle_plate' };
  if (groupBy === 'occurred_on') return { id: `to_char(record.occurred_on, 'YYYY-MM-DD')`, name: `to_char(record.occurred_on, 'YYYY-MM-DD')` };
  return { id: 'NULL::text', name: 'NULL::text' };
}
