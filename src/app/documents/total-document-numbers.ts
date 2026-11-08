import type { Database } from '../db/transaction.ts';
import { WhereClause } from '../records/where-clause.ts';
import { addDocumentFilters, type DocumentFilters } from './add-document-filters.ts';
import { buildMatchKey } from './build-match-key.ts';

export type DocumentNumberTotal = { group: string | null; unit: string; count: number; sum: string; min: string; max: string };

export type DocumentNumberTotals = { groups: DocumentNumberTotal[] };

export type TotalRequest = { meaning: string; filters: DocumentFilters };

type TotalRow = { unit: string | null; count: number; sum: string; min: string; max: string };

const SELECT_TOTAL = `SELECT min(line.unit) AS unit, count(line.number)::int AS count, sum(line.number)::text AS sum,
    min(line.number)::text AS min, max(line.number)::text AS max
  FROM documents document
  JOIN document_lines line ON line.document_id = document.id
  JOIN meanings meaning ON meaning.id = line.meaning_id`;

export async function totalDocumentNumbers(database: Database, request: TotalRequest): Promise<DocumentNumberTotals> {
  const where = new WhereClause();
  where.require(`document.status = 'accepted'`);
  where.require(`meaning.value_type = 'number' AND meaning.match_key = ${where.bind(buildMatchKey(request.meaning))}`);
  addDocumentFilters(where, request.filters);
  const { rows } = await database.query<TotalRow>(`${SELECT_TOTAL} WHERE ${where.toSql()}`, where.values);
  return { groups: rows.filter(hasGroup).map(buildTotal) };
}

function hasGroup(row: TotalRow): row is TotalRow & { unit: string } {
  return row.unit !== null;
}

function buildTotal(row: TotalRow & { unit: string }): DocumentNumberTotal {
  return { group: null, unit: row.unit, count: row.count, sum: row.sum, min: row.min, max: row.max };
}
