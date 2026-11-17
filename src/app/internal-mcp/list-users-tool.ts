import type { Database } from '../db/transaction.ts';
import type { McpTool, McpToolResult } from '../../services/mcp/mcp-endpoint.ts';
import { decodeSearchCursor, encodeSearchCursor } from '../records/search-cursor.ts';
import { WhereClause } from '../records/where-clause.ts';

const PAGE_SIZE = 50;
const MAX_LIMIT = 200;

const LIST_USERS_DESCRIPTION = `Liệt kê người dùng (users) từ tất cả các workspace.
List users across all workspaces.
Filters: workspace_id, is_internal, created_from (YYYY-MM-DD Vietnam), created_to.
Pagination: limit (default 50, max 200), cursor.`;

const LIST_USERS_SCHEMA = {
  type: 'object',
  properties: {
    workspace_id: { type: ['string', 'null'] },
    is_internal: { type: ['boolean', 'null'] },
    created_from: { type: ['string', 'null'], description: 'YYYY-MM-DD Vietnam date' },
    created_to: { type: ['string', 'null'], description: 'YYYY-MM-DD Vietnam date' },
    limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: PAGE_SIZE },
    cursor: { type: ['string', 'null'] },
  },
};

const SELECT_USERS = `
  SELECT u.id, u.is_internal,
    to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
    COALESCE(
      json_agg(json_build_object(
        'workspace_id', m.workspace_id,
        'workspace_name', w.name,
        'role', m.role,
        'display_name', m.display_name,
        'joined_at', to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ) ORDER BY m.created_at)
      FILTER (WHERE m.workspace_id IS NOT NULL),
      '[]'::json
    ) AS memberships
  FROM users u
  LEFT JOIN memberships m ON m.user_id = u.id
  LEFT JOIN workspaces w ON w.id = m.workspace_id`;

export function buildListUsersTool(ownerPool: Database): McpTool {
  return {
    name: 'list_users',
    description: LIST_USERS_DESCRIPTION,
    inputSchema: LIST_USERS_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    call: (args) => callListUsers(ownerPool, args),
  };
}

async function callListUsers(ownerPool: Database, args: unknown): Promise<McpToolResult> {
  const params = parseListUsersArgs(args);
  const where = buildUsersWhere(params);
  const limit = params.limit ?? PAGE_SIZE;
  const { rows } = await ownerPool.query<UserRow>(
    `${SELECT_USERS} WHERE ${where.toSql()} GROUP BY u.id, u.created_at ORDER BY u.created_at DESC, u.id DESC LIMIT ${limit + 1}`,
    where.values,
  );
  return { text: JSON.stringify(toUsersPage(rows, limit)), isError: false };
}

type ListUsersArgs = {
  workspace_id?: string | null;
  is_internal?: boolean | null;
  created_from?: string | null;
  created_to?: string | null;
  limit?: number | null;
  cursor?: string | null;
};

type UserRow = {
  id: string;
  is_internal: boolean;
  created_at: string;
  memberships: MembershipRow[];
};

type MembershipRow = {
  workspace_id: string;
  workspace_name: string;
  role: string;
  display_name: string;
  joined_at: string;
};

function parseListUsersArgs(args: unknown): ListUsersArgs {
  if (typeof args !== 'object' || args === null) return {};
  return args as ListUsersArgs;
}

function buildUsersWhere(params: ListUsersArgs): WhereClause {
  const where = new WhereClause();
  where.require('true');
  if (params.workspace_id != null) where.require(`m.workspace_id = ${where.bind(params.workspace_id)}`);
  if (params.is_internal != null) where.require(`u.is_internal = ${where.bind(params.is_internal)}`);
  addVietnamDateConditions(where, params);
  if (params.cursor != null) addCursorCondition(where, params.cursor);
  return where;
}

function addVietnamDateConditions(where: WhereClause, params: ListUsersArgs): void {
  const vietnamDate = `DATE(u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
  if (params.created_from != null) where.require(`${vietnamDate} >= ${where.bind(params.created_from)}::date`);
  if (params.created_to != null) where.require(`${vietnamDate} <= ${where.bind(params.created_to)}::date`);
}

function addCursorCondition(where: WhereClause, cursorText: string): void {
  const cursor = decodeSearchCursor(cursorText);
  if (cursor === null) return;
  where.require(`(u.created_at, u.id) < (${where.bind(cursor.createdAt)}::timestamptz, ${where.bind(cursor.id)}::uuid)`);
}

function toUsersPage(rows: UserRow[], limit: number): { items: UserRow[]; next_cursor: string | null } {
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = pageRows[pageRows.length - 1];
  const next_cursor = hasMore && last !== undefined ? encodeSearchCursor({ createdAt: last.created_at, id: last.id }) : null;
  return { items: pageRows, next_cursor };
}
