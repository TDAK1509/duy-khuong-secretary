import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import type { WhereClause } from '../records/where-clause.ts';
import type { DocumentFilters } from './add-document-filters.ts';
import { ACCEPTED_CONFIRMED, buildDocumentWhere, type DocumentRule } from './build-document-where.ts';
import { buildDocumentDateSql } from './build-document-date.ts';
import { buildMatchKey } from './build-match-key.ts';
import { countNotRereadMessages } from './count-not-reread-messages.ts';
import { buildGroupSql, type DocumentGroup } from './document-groups.ts';

export type DocumentNumberTotal = { group: string | null; unit: string; count: number; sum: string; min: string; max: string };

export type DocumentNumberTotals = {
  groups: DocumentNumberTotal[];
  pendingNameDocuments: number;
  reviewDocuments: number;
  withoutNumber: number;
  notRereadMessages: number;
};

export type LineLevel = 'document' | 'item';

export type TotalRequest = { meaning: string; lines: LineLevel; filters: DocumentFilters; groupBy: DocumentGroup };

const FROM_NUMBER_LINES = `FROM documents document
  JOIN document_lines line ON line.document_id = document.id
  JOIN meanings meaning ON meaning.id = line.meaning_id`;

const FROM_MEANING_LINES = `FROM document_lines line JOIN meanings meaning ON meaning.id = line.meaning_id`;

const SUM_NUMBERS = `line.unit AS unit, count(line.number)::int AS count, sum(line.number)::text AS sum,
    min(line.number)::text AS min, max(line.number)::text AS max`;

export async function totalDocumentNumbers(database: Database, scope: AccessScope, request: TotalRequest): Promise<DocumentNumberTotals> {
  return {
    groups: await sumNumbers(database, scope, request),
    pendingNameDocuments: await countPendingNameDocuments(database, scope, request),
    reviewDocuments: await countDocuments(database, scope, request, { status: 'needs_review', link: 'organization_id' }),
    withoutNumber: await countWithoutNumber(database, scope, request),
    notRereadMessages: await countNotRereadMessages(database),
  };
}

async function sumNumbers(database: Database, scope: AccessScope, request: TotalRequest): Promise<DocumentNumberTotal[]> {
  const where = buildNumberWhere(scope, request, ACCEPTED_CONFIRMED);
  const groupSql = buildGroupSql(request.groupBy, buildDocumentDateSql(where, request.filters.dateMeaning));
  const { rows } = await database.query<DocumentNumberTotal>(
    `SELECT ${groupSql} AS "group", ${SUM_NUMBERS} ${FROM_NUMBER_LINES} WHERE ${where.toSql()} GROUP BY 1, 2 ORDER BY 1 NULLS LAST, 2`,
    where.values,
  );
  return rows;
}

async function countPendingNameDocuments(database: Database, scope: AccessScope, request: TotalRequest): Promise<number> {
  if (request.filters.organization === null) return 0;
  return countDocuments(database, scope, request, { status: 'accepted', link: 'proposed_organization_id' });
}

async function countDocuments(database: Database, scope: AccessScope, request: TotalRequest, rule: DocumentRule): Promise<number> {
  const where = buildNumberWhere(scope, request, rule);
  const { rows } = await database.query<{ count: number }>(
    `SELECT count(DISTINCT document.id)::int AS count ${FROM_NUMBER_LINES} WHERE ${where.toSql()}`,
    where.values,
  );
  return rows[0]?.count ?? 0;
}

async function countWithoutNumber(database: Database, scope: AccessScope, request: TotalRequest): Promise<number> {
  const where = buildDocumentWhere(scope.workspaceId, request.filters, ACCEPTED_CONFIRMED);
  where.require(`EXISTS (SELECT 1 ${FROM_MEANING_LINES} WHERE ${buildMeaningCondition(where, request.meaning)})`);
  where.require(`NOT EXISTS (SELECT 1 ${FROM_MEANING_LINES} WHERE ${buildNumberCondition(where, request)})`);
  const { rows } = await database.query<{ count: number }>(`SELECT count(*)::int AS count FROM documents document WHERE ${where.toSql()}`, where.values);
  return rows[0]?.count ?? 0;
}

function buildNumberWhere(scope: AccessScope, request: TotalRequest, rule: DocumentRule): WhereClause {
  const where = buildDocumentWhere(scope.workspaceId, request.filters, rule);
  where.require(buildNumberCondition(where, request));
  return where;
}

function buildNumberCondition(where: WhereClause, request: TotalRequest): string {
  const level = request.lines === 'document' ? 'line.item IS NULL' : 'line.item IS NOT NULL';
  return `${buildMeaningCondition(where, request.meaning)} AND line.number IS NOT NULL AND ${level}`;
}

function buildMeaningCondition(where: WhereClause, meaning: string): string {
  return `line.document_id = document.id AND meaning.value_type = 'number' AND meaning.match_key = ${where.bind(buildMatchKey(meaning))}`;
}
