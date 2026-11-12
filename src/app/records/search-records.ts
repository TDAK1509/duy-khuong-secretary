import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { normalizeCode, toAccentFreeForm } from '../reading/normalize.ts';
import { addDateConditions, addDocumentDateConditions } from './add-date-conditions.ts';
import { encodeSearchCursor, type SearchCursor } from './search-cursor.ts';
import { WhereClause } from './where-clause.ts';

const PAGE_SIZE = 50;

export type RecordFilters = {
  text: string | null;
  category: string | null;
  member: string | null;
  plate: string | null;
  addedFrom: string | null;
  addedTo: string | null;
  occurredFrom: string | null;
  occurredTo: string | null;
};

export type SearchFilters = RecordFilters & { cursor: SearchCursor | null };

export type FoundRecord = {
  id: string;
  member: string;
  category: string;
  document_title: string | null;
  maintenance_item: string | null;
  plate: string | null;
  document_number: string | null;
  occurred_on: string | null;
  amount_vnd: number | null;
  summary: string;
  identifiers: string[];
  details: { label: string; value: string }[];
  added_at: string;
  has_photo: boolean;
};

export type SearchPage = { items: FoundRecord[]; nextCursor: string | null };

type FoundRow = FoundRecord & { created_at_utc: string };

const SELECT_FOUND_ROWS = `SELECT record.id, record.sender_name AS member, record.category, record.document_title, record.maintenance_item,
    record.vehicle_plate AS plate, record.document_number,
    to_char(record.occurred_on, 'YYYY-MM-DD') AS occurred_on, record.amount_vnd::float8 AS amount_vnd,
    record.summary, record.identifiers, record.details,
    to_char(record.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY') AS added_at,
    message.image_key IS NOT NULL AS has_photo,
    to_char(record.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_utc
  FROM records record JOIN messages message ON message.id = record.message_id`;

export async function searchRecords(database: Database, scope: AccessScope, filters: SearchFilters): Promise<SearchPage> {
  const where = buildWhere(scope, filters);
  addCursorCondition(where, filters.cursor);
  const { rows } = await database.query<FoundRow>(
    `${SELECT_FOUND_ROWS} WHERE ${where.toSql()}
     ORDER BY record.created_at DESC, record.id DESC
     LIMIT ${PAGE_SIZE + 1}`,
    where.values,
  );
  return toPage(rows);
}

export function buildWhere(scope: AccessScope, filters: RecordFilters): WhereClause {
  const where = new WhereClause();
  where.require(`record.workspace_id = ${where.bind(scope.workspaceId)}`);
  if (scope.role === 'member') where.require(`record.user_id = ${where.bind(scope.userId)}`);
  if (filters.text !== null) where.require(buildTextCondition(where, filters.text));
  if (filters.member !== null) where.require(buildAccentFreeEquals(where, 'record.sender_name', filters.member));
  if (filters.plate !== null) where.require(`record.vehicle_plate = ${where.bind(normalizeCode(filters.plate))}`);
  if (filters.category !== null) where.require(buildAccentFreeEquals(where, 'record.category', filters.category));
  addDateConditions(where, filters);
  addDocumentDateConditions(where, filters);
  return where;
}

function buildTextCondition(where: WhereClause, text: string): string {
  return `(${buildAccentFreeCondition(where, text)} OR ${buildCodeCondition(where, text)})`;
}

function buildAccentFreeCondition(where: WhereClause, text: string): string {
  const accentFree = toAccentFreeForm(text);
  if (accentFree === null) return 'false';
  const bound = where.bind(accentFree);
  const contains = (column: string) =>
    `strpos(trim(regexp_replace(lower(unaccent(${column})), '\\s+', ' ', 'g')), ${bound}) > 0`;
  return `(${contains('record.summary')} OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(record.details) detail
    WHERE ${contains(`detail ->> 'label'`)} OR ${contains(`detail ->> 'value'`)}))`;
}

function buildCodeCondition(where: WhereClause, text: string): string {
  const code = normalizeCode(text);
  if (code === null) return 'false';
  const bound = where.bind(code);
  return `(strpos(record.vehicle_plate, ${bound}) > 0 OR strpos(record.document_number, ${bound}) > 0
    OR EXISTS (SELECT 1 FROM unnest(record.identifiers) identifier WHERE strpos(identifier, ${bound}) > 0))`;
}

export function buildAccentFreeEquals(where: WhereClause, column: string, text: string): string {
  const bound = where.bind(toAccentFreeForm(text) ?? '');
  return `regexp_replace(trim(lower(unaccent(${column}))), '\\s+', ' ', 'g') = ${bound}`;
}

function addCursorCondition(where: WhereClause, cursor: SearchCursor | null): void {
  if (cursor === null) return;
  where.require(`(record.created_at, record.id) < (${where.bind(cursor.createdAt)}::timestamptz, ${where.bind(cursor.id)}::uuid)`);
}

function toPage(rows: FoundRow[]): SearchPage {
  const pageRows = rows.slice(0, PAGE_SIZE);
  const last = pageRows[pageRows.length - 1];
  const hasMore = rows.length > PAGE_SIZE && last !== undefined;
  return {
    items: pageRows.map(toFoundRecord),
    nextCursor: hasMore ? encodeSearchCursor({ createdAt: last.created_at_utc, id: last.id }) : null,
  };
}

function toFoundRecord(row: FoundRow): FoundRecord {
  return {
    id: row.id,
    member: row.member,
    category: row.category,
    document_title: row.document_title,
    maintenance_item: row.maintenance_item,
    plate: row.plate,
    document_number: row.document_number,
    occurred_on: row.occurred_on,
    amount_vnd: row.amount_vnd,
    summary: row.summary,
    identifiers: row.identifiers,
    details: row.details,
    added_at: row.added_at,
    has_photo: row.has_photo,
  };
}
