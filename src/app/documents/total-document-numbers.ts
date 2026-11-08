import type { Database } from '../db/transaction.ts';
import { WhereClause } from '../records/where-clause.ts';
import { addDocumentFilters, type DocumentFilters, type OrganizationLink } from './add-document-filters.ts';
import { buildMatchKey } from './build-match-key.ts';

export type DocumentNumberTotal = { group: string | null; unit: string; count: number; sum: string; min: string; max: string };

export type DocumentNumberTotals = { groups: DocumentNumberTotal[]; pendingNameDocuments: number };

export type TotalRequest = { meaning: string; filters: DocumentFilters };

type TotalRow = { unit: string | null; count: number; sum: string; min: string; max: string };

const FROM_NUMBER_LINES = `FROM documents document
  JOIN document_lines line ON line.document_id = document.id
  JOIN meanings meaning ON meaning.id = line.meaning_id`;

const SUM_NUMBERS = `SELECT min(line.unit) AS unit, count(line.number)::int AS count, sum(line.number)::text AS sum,
    min(line.number)::text AS min, max(line.number)::text AS max`;

export async function totalDocumentNumbers(database: Database, request: TotalRequest): Promise<DocumentNumberTotals> {
  const groups = await sumNumbers(database, request);
  const pendingNameDocuments = await countPendingNameDocuments(database, request);
  return { groups, pendingNameDocuments };
}

async function sumNumbers(database: Database, request: TotalRequest): Promise<DocumentNumberTotal[]> {
  const where = buildWhere(request, 'organization_id');
  const { rows } = await database.query<TotalRow>(`${SUM_NUMBERS} ${FROM_NUMBER_LINES} WHERE ${where.toSql()}`, where.values);
  return rows.filter(hasGroup).map(buildTotal);
}

async function countPendingNameDocuments(database: Database, request: TotalRequest): Promise<number> {
  const where = buildWhere(request, 'proposed_organization_id');
  const { rows } = await database.query<{ count: number }>(
    `SELECT count(DISTINCT document.id)::int AS count ${FROM_NUMBER_LINES} WHERE ${where.toSql()}`,
    where.values,
  );
  return rows[0]?.count ?? 0;
}

function buildWhere(request: TotalRequest, link: OrganizationLink): WhereClause {
  const where = new WhereClause();
  where.require(`document.status = 'accepted'`);
  where.require(`meaning.value_type = 'number' AND meaning.match_key = ${where.bind(buildMatchKey(request.meaning))}`);
  addDocumentFilters(where, request.filters, link);
  return where;
}

function hasGroup(row: TotalRow): row is TotalRow & { unit: string } {
  return row.unit !== null;
}

function buildTotal(row: TotalRow & { unit: string }): DocumentNumberTotal {
  return { group: null, unit: row.unit, count: row.count, sum: row.sum, min: row.min, max: row.max };
}
