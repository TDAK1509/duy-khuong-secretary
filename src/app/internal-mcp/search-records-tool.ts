import type { Database } from '../db/transaction.ts';
import type { McpTool, McpToolResult } from '../../services/mcp/mcp-endpoint.ts';
import { normalizeCode, toAccentFreeForm } from '../reading/normalize.ts';
import { buildAccentFreeEquals } from '../records/search-records.ts';
import { addDateConditions, addDocumentDateConditions } from '../records/add-date-conditions.ts';
import { decodeSearchCursor, encodeSearchCursor } from '../records/search-cursor.ts';
import { WhereClause } from '../records/where-clause.ts';

const PAGE_SIZE = 50;
const MAX_LIMIT = 200;

const SEARCH_RECORDS_DESCRIPTION = `Tìm kiếm hồ sơ (records) trên tất cả các workspace.
Search records across all workspaces.
Filters: workspace_id, text (full-text), category, member (sender name), plate, added_from/added_to (Vietnam dates), occurred_from/occurred_to.
Pagination: limit (default 50, max 200), cursor.`;

const SEARCH_RECORDS_SCHEMA = {
  type: 'object',
  properties: {
    workspace_id: { type: ['string', 'null'] },
    text: { type: ['string', 'null'], description: 'Full-text search on summary and details' },
    category: { type: ['string', 'null'] },
    member: { type: ['string', 'null'], description: 'Sender display name (accent-free match)' },
    plate: { type: ['string', 'null'], description: 'Vehicle plate (normalized)' },
    added_from: { type: ['string', 'null'], description: 'YYYY-MM-DD Vietnam date' },
    added_to: { type: ['string', 'null'], description: 'YYYY-MM-DD Vietnam date' },
    occurred_from: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    occurred_to: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: PAGE_SIZE },
    cursor: { type: ['string', 'null'] },
  },
};

const SELECT_RECORDS = `
  SELECT record.id, record.workspace_id,
    record.sender_name AS member, record.category, record.document_title, record.maintenance_item,
    record.vehicle_plate AS plate, record.document_number,
    to_char(record.occurred_on, 'YYYY-MM-DD') AS occurred_on, record.amount_vnd::float8 AS amount_vnd,
    record.summary, record.identifiers, record.details,
    to_char(record.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY') AS added_at,
    message.image_key IS NOT NULL AS has_photo,
    to_char(record.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_utc
  FROM records record
  JOIN messages message ON message.id = record.message_id`;

export function buildSearchRecordsTool(ownerPool: Database): McpTool {
  return {
    name: 'search_records',
    description: SEARCH_RECORDS_DESCRIPTION,
    inputSchema: SEARCH_RECORDS_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    call: (args) => callSearchRecords(ownerPool, args),
  };
}

async function callSearchRecords(ownerPool: Database, args: unknown): Promise<McpToolResult> {
  const params = parseSearchRecordsArgs(args);
  const where = buildSearchWhere(params);
  const limit = params.limit ?? PAGE_SIZE;
  const { rows } = await ownerPool.query<RecordRow>(
    `${SELECT_RECORDS} WHERE ${where.toSql()} ORDER BY record.created_at DESC, record.id DESC LIMIT ${limit + 1}`,
    where.values,
  );
  return { text: JSON.stringify(toRecordsPage(rows, limit)), isError: false };
}

type SearchRecordsArgs = {
  workspace_id?: string | null;
  text?: string | null;
  category?: string | null;
  member?: string | null;
  plate?: string | null;
  added_from?: string | null;
  added_to?: string | null;
  occurred_from?: string | null;
  occurred_to?: string | null;
  limit?: number | null;
  cursor?: string | null;
};

type RecordRow = {
  id: string;
  workspace_id: string;
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
  created_at_utc: string;
};

function parseSearchRecordsArgs(args: unknown): SearchRecordsArgs {
  if (typeof args !== 'object' || args === null) return {};
  return args as SearchRecordsArgs;
}

function buildSearchWhere(params: SearchRecordsArgs): WhereClause {
  const where = new WhereClause();
  where.require('true');
  addIdentifierConditions(where, params);
  addDateRangeConditions(where, params);
  if (params.cursor != null) addCursorCondition(where, params.cursor);
  return where;
}

function addIdentifierConditions(where: WhereClause, params: SearchRecordsArgs): void {
  if (params.workspace_id != null) where.require(`record.workspace_id = ${where.bind(params.workspace_id)}`);
  if (params.text != null) where.require(buildTextCondition(where, params.text));
  if (params.category != null) where.require(`record.category = ${where.bind(params.category)}`);
  if (params.member != null) where.require(buildAccentFreeEquals(where, 'record.sender_name', params.member));
  if (params.plate != null) addNormalizedPlateCondition(where, params.plate);
}

function addDateRangeConditions(where: WhereClause, params: SearchRecordsArgs): void {
  addDateConditions(where, { addedFrom: params.added_from ?? null, addedTo: params.added_to ?? null });
  addDocumentDateConditions(where, { occurredFrom: params.occurred_from ?? null, occurredTo: params.occurred_to ?? null });
}

function buildTextCondition(where: WhereClause, text: string): string {
  return `(${buildAccentFreeTextCondition(where, text)} OR ${buildCodeTextCondition(where, text)})`;
}

function buildAccentFreeTextCondition(where: WhereClause, text: string): string {
  const accentFree = toAccentFreeForm(text);
  if (accentFree === null) return 'false';
  const bound = where.bind(accentFree);
  const contains = (column: string) => `strpos(trim(regexp_replace(lower(unaccent(${column})), '\\s+', ' ', 'g')), ${bound}) > 0`;
  return `(${contains('record.summary')} OR EXISTS (SELECT 1 FROM jsonb_array_elements(record.details) detail WHERE ${contains(`detail ->> 'label'`)} OR ${contains(`detail ->> 'value'`)}))`;
}

function buildCodeTextCondition(where: WhereClause, text: string): string {
  const code = normalizeCode(text);
  if (code === null) return 'false';
  const bound = where.bind(code);
  return `(strpos(record.vehicle_plate, ${bound}) > 0 OR strpos(record.document_number, ${bound}) > 0 OR EXISTS (SELECT 1 FROM unnest(record.identifiers) identifier WHERE strpos(identifier, ${bound}) > 0))`;
}

function addNormalizedPlateCondition(where: WhereClause, plate: string): void {
  const normalized = normalizeCode(plate);
  if (normalized !== null) where.require(`record.vehicle_plate = ${where.bind(normalized)}`);
}

function addCursorCondition(where: WhereClause, cursorText: string): void {
  const cursor = decodeSearchCursor(cursorText);
  if (cursor === null) return;
  where.require(`(record.created_at, record.id) < (${where.bind(cursor.createdAt)}::timestamptz, ${where.bind(cursor.id)}::uuid)`);
}

function toRecordsPage(rows: RecordRow[], limit: number): { items: RecordItem[]; next_cursor: string | null } {
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = pageRows[pageRows.length - 1];
  const next_cursor = hasMore && last !== undefined ? encodeSearchCursor({ createdAt: last.created_at_utc, id: last.id }) : null;
  return { items: pageRows.map(toRecordItem), next_cursor };
}

type RecordItem = Omit<RecordRow, 'created_at_utc'>;

function toRecordItem(row: RecordRow): RecordItem {
  const { created_at_utc: _, ...item } = row;
  return item;
}
