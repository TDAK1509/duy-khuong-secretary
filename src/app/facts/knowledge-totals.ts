import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import type { DocumentFilters } from '../documents/add-document-filters.ts';
import { buildDocumentWhere, type DocumentRule } from '../documents/build-document-where.ts';
import { buildMatchKey } from '../documents/build-match-key.ts';
import type { DocumentGroup } from '../documents/document-groups.ts';
import type { WhereClause } from '../records/where-clause.ts';
import { buildOutcomeRowsSql } from './knowledge-outcomes.ts';

export const WEIGHT_MEANING = 'Trọng lượng hàng';

export type KnowledgeValueRequest = { valueName: string; filters: DocumentFilters; groupBy: DocumentGroup };

export type DocumentKnowledgeRow = { group: string | null; number: string | null; unit: string | null; text: string | null; weight_kg: string | null };

export type KnowledgeTotals = { documents: DocumentKnowledgeRow[]; reviewDocuments: number; notRereadMessages: number };

export async function countReviewDocuments(database: Database, scope: AccessScope, request: KnowledgeValueRequest): Promise<number> {
  const where = buildDocumentWhere(scope.workspaceId, request.filters, { status: 'needs_review' } satisfies DocumentRule);
  const { rows } = await database.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM documents document ${buildWinnerJoin(where, request.valueName)} WHERE ${where.toSql()}`,
    where.values,
  );
  return rows[0]?.count ?? 0;
}

function buildWinnerJoin(where: WhereClause, valueName: string): string {
  return `JOIN LATERAL (
    SELECT outcome.number, outcome.unit
    FROM company_knowledge_links link
    JOIN company_knowledge_entries entry ON entry.id = link.entry_id AND entry.workspace_id = link.workspace_id
    CROSS JOIN LATERAL (${buildOutcomeRowsSql('entry')}) outcome
    WHERE link.document_id = document.id AND outcome.match_key = ${where.bind(buildMatchKey(valueName))}
    ORDER BY entry.updated_at DESC, entry.id DESC
    LIMIT 1
  ) winner ON true`;
}

export function buildWeightSql(where: WhereClause): string {
  return `(SELECT line.number::text FROM document_lines line JOIN meanings meaning ON meaning.id = line.meaning_id
    WHERE line.document_id = document.id AND line.item IS NULL AND line.unit = 'kg'
      AND meaning.value_type = 'number' AND meaning.match_key = ${where.bind(buildMatchKey(WEIGHT_MEANING))}
    ORDER BY line.line_no LIMIT 1)`;
}
