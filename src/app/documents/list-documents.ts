import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import type { WhereClause } from '../records/where-clause.ts';
import { encodeSearchCursor, type SearchCursor } from '../records/search-cursor.ts';
import { ACCEPTED_CONFIRMED } from './build-document-where.ts';
import { buildDocumentDateSql } from './build-document-date.ts';
import { buildGroupSql } from './document-groups.ts';
import { buildNumberWhere, FROM_NUMBER_LINES, type NumberRequest } from './total-document-numbers.ts';

const PAGE_SIZE = 20;

export type ListedNumber = { line_no: number; item: string | null; label: string; value: string; number: string; unit: string };

export type ListedDocument = {
  id: string;
  kind: string;
  stage: string | null;
  document_number: string | null;
  document_date: string | null;
  plate: string | null;
  summary: string;
  organization_group: string | null;
  filter_date: string | null;
  numbers: ListedNumber[];
};

export type DocumentPage = { documents: ListedDocument[]; nextCursor: string | null };

type DocumentRow = ListedDocument & { created_at_utc: string };

export async function listDocuments(database: Database, scope: AccessScope, request: NumberRequest, cursor: SearchCursor | null): Promise<DocumentPage> {
  const where = buildNumberWhere(scope, request, ACCEPTED_CONFIRMED);
  if (cursor !== null) where.require(`(document.created_at, document.id) < (${where.bind(cursor.createdAt)}::timestamptz, ${where.bind(cursor.id)}::uuid)`);
  const { rows } = await database.query<DocumentRow>(buildSelect(where, request), where.values);
  return toPage(rows);
}

function buildSelect(where: WhereClause, { filters }: NumberRequest): string {
  return `SELECT document.id, document.kind, document.stage, document.document_number,
       to_char(document.document_date, 'YYYY-MM-DD') AS document_date, document.vehicle_plate AS plate, document.summary,
       ${buildGroupSql('organization', where, filters)} AS organization_group,
       to_char(${buildDocumentDateSql(where, filters.dateMeaning)}, 'YYYY-MM-DD') AS filter_date,
       jsonb_agg(jsonb_build_object('line_no', line.line_no, 'item', line.item, 'label', line.label, 'value', line.value,
         'number', line.number::text, 'unit', line.unit) ORDER BY line.line_no) AS numbers,
       to_char(document.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_utc
     ${FROM_NUMBER_LINES} WHERE ${where.toSql()}
     GROUP BY document.id
     ORDER BY document.created_at DESC, document.id DESC
     LIMIT ${PAGE_SIZE + 1}`;
}

function toPage(rows: DocumentRow[]): DocumentPage {
  const pageRows = rows.slice(0, PAGE_SIZE);
  const last = pageRows[pageRows.length - 1];
  const hasMore = rows.length > PAGE_SIZE && last !== undefined;
  return {
    documents: pageRows.map(toListedDocument),
    nextCursor: hasMore ? encodeSearchCursor({ createdAt: last.created_at_utc, id: last.id }) : null,
  };
}

function toListedDocument(row: DocumentRow): ListedDocument {
  return {
    id: row.id,
    kind: row.kind,
    stage: row.stage,
    document_number: row.document_number,
    document_date: row.document_date,
    plate: row.plate,
    summary: row.summary,
    organization_group: row.organization_group,
    filter_date: row.filter_date,
    numbers: row.numbers,
  };
}
