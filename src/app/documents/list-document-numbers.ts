import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import type { DocumentFilters } from './add-document-filters.ts';
import { ACCEPTED_CONFIRMED, buildDocumentWhere } from './build-document-where.ts';

export type DocumentNumberKind = {
  meaning: string;
  value_type: string;
  unit: string | null;
  document_count: number;
  item_document_count: number;
};

const SELECT_KINDS = `SELECT meaning.name AS meaning, meaning.value_type, line.unit,
    count(DISTINCT document.id) FILTER (WHERE line.item IS NULL)::int AS document_count,
    count(DISTINCT document.id) FILTER (WHERE line.item IS NOT NULL)::int AS item_document_count
  FROM documents document
  JOIN document_lines line ON line.document_id = document.id
  JOIN meanings meaning ON meaning.id = line.meaning_id`;

export async function listDocumentNumbers(database: Database, scope: AccessScope, filters: DocumentFilters): Promise<DocumentNumberKind[]> {
  const where = buildDocumentWhere(scope.workspaceId, filters, ACCEPTED_CONFIRMED);
  where.require('(line.number IS NOT NULL OR line.at IS NOT NULL)');
  const { rows } = await database.query<DocumentNumberKind>(
    `${SELECT_KINDS} WHERE ${where.toSql()} GROUP BY meaning.id, line.unit ORDER BY meaning.name, line.unit`,
    where.values,
  );
  return rows;
}
