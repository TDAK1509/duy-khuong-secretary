import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { buildAccentFreeEquals, buildWhere, type RecordFilters } from './search-records.ts';

export const NUMBER_GROUPS = ['none', 'member', 'plate', 'category', 'occurred_on'] as const;

export type NumberGroup = (typeof NUMBER_GROUPS)[number];

export type NumberTotal = { group: string | null; unit: string; count: number; sum: string; min: string; max: string };

export type NumberTotals = { groups: NumberTotal[]; withoutNumber: number };

export async function totalNumbers(database: Database, scope: AccessScope, label: string, filters: RecordFilters): Promise<NumberTotals> {
  const where = buildWhere(scope, filters);
  const recordSql = where.toSql();
  const labelMatch = buildAccentFreeEquals(where, `detail ->> 'label'`, label);
  const { rows } = await database.query<NumberTotal>(
    `SELECT NULL::text AS "group", detail ->> 'unit' AS unit, count(*)::int AS count,
       sum((detail -> 'number')::numeric)::text AS sum, min((detail -> 'number')::numeric)::text AS min, max((detail -> 'number')::numeric)::text AS max
     FROM records record CROSS JOIN LATERAL jsonb_array_elements(record.details) detail
     WHERE ${recordSql} AND ${labelMatch}
     GROUP BY unit
     ORDER BY unit`,
    where.values,
  );
  return { groups: rows, withoutNumber: 0 };
}
