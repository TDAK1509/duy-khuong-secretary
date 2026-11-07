import type { Database } from '../db/transaction.ts';

export type NumberLabel = { label: string; unit: string; count: number };

export async function listNumberLabels(database: Database): Promise<NumberLabel[]> {
  const { rows } = await database.query<NumberLabel>(
    `SELECT detail ->> 'label' AS label, detail ->> 'unit' AS unit, count(*)::int AS count
     FROM records record CROSS JOIN LATERAL jsonb_array_elements(record.details) detail
     GROUP BY label, unit
     ORDER BY count DESC, label`,
  );
  return rows;
}
