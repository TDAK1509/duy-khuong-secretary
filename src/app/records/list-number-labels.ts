import type { Database } from '../db/transaction.ts';

export type NumberLabel = { label: string; unit: string; count: number };

const LIST_NUMBER_LABELS = `SELECT (array_agg(label ORDER BY spelling_count DESC, label))[1] AS label, unit, sum(spelling_count)::int AS count
  FROM (
    SELECT regexp_replace(trim(lower(unaccent(detail ->> 'label'))), '\\s+', ' ', 'g') AS label_key,
      detail ->> 'label' AS label, detail ->> 'unit' AS unit, count(*) AS spelling_count
    FROM records record CROSS JOIN LATERAL jsonb_array_elements(record.details) detail
    GROUP BY label_key, label, unit
  ) spelling
  GROUP BY label_key, unit
  ORDER BY count DESC, label, unit`;

export async function listNumberLabels(database: Database): Promise<NumberLabel[]> {
  const { rows } = await database.query<NumberLabel>(LIST_NUMBER_LABELS);
  return rows;
}
