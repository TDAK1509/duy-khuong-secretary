import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import type { DocumentFilters } from '../documents/add-document-filters.ts';
import { ACCEPTED_CONFIRMED, buildDocumentWhere, type DocumentRule } from '../documents/build-document-where.ts';
import { buildMatchKey } from '../documents/build-match-key.ts';
import { countNotRereadMessages } from '../documents/count-not-reread-messages.ts';
import { buildGroupSql, type DocumentGroup } from '../documents/document-groups.ts';
import type { WhereClause } from '../records/where-clause.ts';

export const PER_TON_UNIT = 'đ/tấn';
export const WEIGHT_MEANING = 'Trọng lượng hàng';

export type FactValueRequest = { valueName: string; filters: DocumentFilters; groupBy: DocumentGroup };

export type DocumentFactValueRow = { group: string | null; number: string | null; unit: string | null; text: string | null; weight_kg: string | null };

export type FactValueTotals = { documents: DocumentFactValueRow[]; reviewDocuments: number; notRereadMessages: number };

export async function totalFactValues(database: Database, scope: AccessScope, request: FactValueRequest): Promise<FactValueTotals> {
  return {
    documents: await listDocumentValues(database, scope, request),
    reviewDocuments: await countReviewDocuments(database, scope, request),
    notRereadMessages: await countNotRereadMessages(database, scope),
  };
}

async function listDocumentValues(database: Database, scope: AccessScope, request: FactValueRequest): Promise<DocumentFactValueRow[]> {
  const where = buildDocumentWhere(scope.workspaceId, request.filters, ACCEPTED_CONFIRMED);
  const groupSql = buildGroupSql(request.groupBy, where, request.filters);
  const winner = buildWinnerJoin(where, request.valueName);
  const weight = buildWeightSql(where);
  const { rows } = await database.query<DocumentFactValueRow>(
    `SELECT ${groupSql} AS "group", winner.number::text AS number, winner.unit, winner.text_value AS text, ${weight} AS weight_kg
     FROM documents document ${winner} WHERE ${where.toSql()} ORDER BY 1 NULLS LAST`,
    where.values,
  );
  return rows;
}

async function countReviewDocuments(database: Database, scope: AccessScope, request: FactValueRequest): Promise<number> {
  const where = buildDocumentWhere(scope.workspaceId, request.filters, { status: 'needs_review' } satisfies DocumentRule);
  const { rows } = await database.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM documents document ${buildWinnerJoin(where, request.valueName)} WHERE ${where.toSql()}`,
    where.values,
  );
  return rows[0]?.count ?? 0;
}

function buildWinnerJoin(where: WhereClause, valueName: string): string {
  return `JOIN LATERAL (
    SELECT value.number, value.unit, value.text_value
    FROM document_facts link
    JOIN facts fact ON fact.id = link.fact_id
    JOIN fact_values value ON value.fact_id = fact.id
    WHERE link.document_id = document.id AND value.match_key = ${where.bind(buildMatchKey(valueName))}
    ORDER BY fact.updated_at DESC, fact.id
    LIMIT 1
  ) winner ON true`;
}

function buildWeightSql(where: WhereClause): string {
  return `(SELECT line.number::text FROM document_lines line JOIN meanings meaning ON meaning.id = line.meaning_id
    WHERE line.document_id = document.id AND line.item IS NULL AND line.unit = 'kg'
      AND meaning.value_type = 'number' AND meaning.match_key = ${where.bind(buildMatchKey(WEIGHT_MEANING))}
    ORDER BY line.line_no LIMIT 1)`;
}
