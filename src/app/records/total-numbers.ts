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
  const { rows } = await database.query<NumberTotal>(
    `SELECT ${buildGroupKey(request.groupBy)} AS "group", detail ->> 'unit' AS unit, count(*)::int AS count,
       sum((detail -> 'number')::numeric)::text AS sum, min((detail -> 'number')::numeric)::text AS min, max((detail -> 'number')::numeric)::text AS max
     FROM records record CROSS JOIN LATERAL jsonb_array_elements(record.details) detail
     WHERE ${recordSql} AND ${labelMatch}
     GROUP BY "group", unit
     ORDER BY "group" NULLS LAST, unit`,
    where.values,
  );
  return { groups: rows, withoutNumber: 0 };
}

function buildGroupKey(groupBy: NumberGroup): string {
  if (groupBy === 'occurred_on') return `to_char(record.occurred_on, 'YYYY-MM-DD')`;
  return 'NULL::text';
}
