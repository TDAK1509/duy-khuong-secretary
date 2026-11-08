import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { buildWhere, type RecordFilters } from './search-records.ts';
import { buildValidNumberPair } from './valid-number-pair.ts';

export type NumberLabel = { label: string; unit: string | null; count: number };

export async function listNumberLabels(database: Database, scope: AccessScope, filters: RecordFilters): Promise<NumberLabel[]> {
  const where = buildWhere(scope, filters);
  const validNumberPair = buildValidNumberPair(where, 'detail');
  const { rows } = await database.query<NumberLabel>(buildNumberLabelsSql(where.toSql(), validNumberPair), where.values);
  return rows;
}

function buildNumberLabelsSql(whereSql: string, validNumberPair: string): string {
  return `SELECT (array_agg(label ORDER BY spelling_count DESC, label))[1] AS label, unit, sum(spelling_count)::int AS count
    FROM (
      SELECT regexp_replace(trim(lower(unaccent(detail ->> 'label'))), '\\s+', ' ', 'g') AS label_key,
        detail ->> 'label' AS label, CASE WHEN ${validNumberPair} THEN detail ->> 'unit' END AS unit, count(*) AS spelling_count
      FROM records record CROSS JOIN LATERAL jsonb_array_elements(record.details) detail
      WHERE ${whereSql}
      GROUP BY label_key, label, unit
    ) spelling
    GROUP BY label_key, unit
    ORDER BY count DESC, label, unit`;
}
