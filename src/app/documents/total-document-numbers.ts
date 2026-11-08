import type { Database } from '../db/transaction.ts';
import { buildMatchKey } from './build-match-key.ts';

export type DocumentNumberTotal = { group: string | null; unit: string; count: number; sum: string; min: string; max: string };

export type DocumentNumberTotals = { groups: DocumentNumberTotal[] };

export type TotalRequest = { meaning: string; organization: string };

type TotalRow = { unit: string | null; count: number; sum: string; min: string; max: string };

const TOTAL_SQL = `SELECT min(line.unit) AS unit, count(line.number)::int AS count, sum(line.number)::text AS sum,
    min(line.number)::text AS min, max(line.number)::text AS max
  FROM documents document
  JOIN document_lines line ON line.document_id = document.id
  JOIN meanings meaning ON meaning.id = line.meaning_id
  WHERE document.status = 'accepted' AND meaning.value_type = 'number' AND meaning.match_key = $1
    AND EXISTS (
      SELECT 1 FROM document_parties party JOIN organization_aliases alias ON alias.organization_id = party.organization_id
      WHERE party.document_id = document.id AND alias.match_key = $2)`;

export async function totalDocumentNumbers(database: Database, request: TotalRequest): Promise<DocumentNumberTotals> {
  const values = [buildMatchKey(request.meaning), buildMatchKey(request.organization)];
  const { rows } = await database.query<TotalRow>(TOTAL_SQL, values);
  return { groups: rows.filter(hasGroup).map(buildTotal) };
}

function hasGroup(row: TotalRow): row is TotalRow & { unit: string } {
  return row.unit !== null;
}

function buildTotal(row: TotalRow & { unit: string }): DocumentNumberTotal {
  return { group: null, unit: row.unit, count: row.count, sum: row.sum, min: row.min, max: row.max };
}
