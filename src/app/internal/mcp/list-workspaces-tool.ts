import type { Database } from '../../db/transaction.ts';
import type { McpTool, McpToolResult } from '../../../services/mcp/mcp-endpoint.ts';
import { decodeSearchCursor, encodeSearchCursor } from '../../records/search-cursor.ts';
import { WhereClause } from '../../records/where-clause.ts';

const PAGE_SIZE = 50;
const MAX_LIMIT = 200;

const LIST_WORKSPACES_DESCRIPTION = `Liệt kê workspace (nhóm).
List workspaces with their member counts and credit balances.
Filters: name (case-insensitive substring), created_from (YYYY-MM-DD Vietnam), created_to.
Pagination: limit (default 50, max 200), cursor.`;

const LIST_WORKSPACES_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: ['string', 'null'], description: 'Case-insensitive substring filter on workspace name' },
    created_from: { type: ['string', 'null'], description: 'YYYY-MM-DD Vietnam date' },
    created_to: { type: ['string', 'null'], description: 'YYYY-MM-DD Vietnam date' },
    limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: PAGE_SIZE },
    cursor: { type: ['string', 'null'] },
  },
};

const SELECT_WORKSPACES = `
  SELECT w.id, w.name, w.credit_balance::text AS credit_balance,
    to_char(w.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
    COUNT(m.user_id)::integer AS member_count
  FROM workspaces w
  LEFT JOIN memberships m ON m.workspace_id = w.id`;

export function buildListWorkspacesTool(ownerPool: Database): McpTool {
  return {
    name: 'list_workspaces',
    description: LIST_WORKSPACES_DESCRIPTION,
    inputSchema: LIST_WORKSPACES_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    call: (args) => callListWorkspaces(ownerPool, args),
  };
}

async function callListWorkspaces(ownerPool: Database, args: unknown): Promise<McpToolResult> {
  const params = parseListWorkspacesArgs(args);
  const where = buildWorkspacesWhere(params);
  const limit = params.limit ?? PAGE_SIZE;
  const { rows } = await ownerPool.query<WorkspaceRow>(
    `${SELECT_WORKSPACES} WHERE ${where.toSql()} GROUP BY w.id, w.created_at ORDER BY w.created_at DESC, w.id DESC LIMIT ${limit + 1}`,
    where.values,
  );
  return { text: JSON.stringify(toWorkspacesPage(rows, limit)), isError: false };
}

type ListWorkspacesArgs = {
  name?: string | null;
  created_from?: string | null;
  created_to?: string | null;
  limit?: number | null;
  cursor?: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string;
  credit_balance: string;
  created_at: string;
  member_count: number;
};

function parseListWorkspacesArgs(args: unknown): ListWorkspacesArgs {
  if (typeof args !== 'object' || args === null) return {};
  return args as ListWorkspacesArgs;
}

function buildWorkspacesWhere(params: ListWorkspacesArgs): WhereClause {
  const where = new WhereClause();
  where.require('true');
  if (params.name != null) where.require(`w.name ILIKE ${where.bind(`%${params.name}%`)}`);
  addVietnamDateConditions(where, params);
  if (params.cursor != null) addCursorCondition(where, params.cursor);
  return where;
}

function addVietnamDateConditions(where: WhereClause, params: ListWorkspacesArgs): void {
  const vietnamDate = `DATE(w.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
  if (params.created_from != null) where.require(`${vietnamDate} >= ${where.bind(params.created_from)}::date`);
  if (params.created_to != null) where.require(`${vietnamDate} <= ${where.bind(params.created_to)}::date`);
}

function addCursorCondition(where: WhereClause, cursorText: string): void {
  const cursor = decodeSearchCursor(cursorText);
  if (cursor === null) return;
  where.require(`(w.created_at, w.id) < (${where.bind(cursor.createdAt)}::timestamptz, ${where.bind(cursor.id)}::uuid)`);
}

function toWorkspacesPage(rows: WorkspaceRow[], limit: number): { items: WorkspaceRow[]; next_cursor: string | null } {
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = pageRows[pageRows.length - 1];
  const next_cursor = hasMore && last !== undefined ? encodeSearchCursor({ createdAt: last.created_at, id: last.id }) : null;
  return { items: pageRows, next_cursor };
}
