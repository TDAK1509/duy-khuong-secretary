import type { Database } from '../../db/transaction.ts';
import type { McpTool, McpToolResult } from '../../../services/mcp/mcp-endpoint.ts';
import { decodeSearchCursor, encodeSearchCursor } from '../../records/search-cursor.ts';
import { WhereClause } from '../../records/where-clause.ts';

const PAGE_SIZE = 50;
const MAX_LIMIT = 200;

const LIST_MEMBERS_DESCRIPTION = `Liệt kê thành viên trong một workspace.
List members of a specific workspace.
Requires: workspace_id.
Filters: role ('admin' | 'member').
Pagination: limit (default 50, max 200), cursor.`;

const LIST_MEMBERS_SCHEMA = {
  type: 'object',
  required: ['workspace_id'],
  properties: {
    workspace_id: { type: 'string', description: 'UUID of the workspace' },
    role: { type: ['string', 'null'], enum: ['admin', 'member', null] },
    limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: PAGE_SIZE },
    cursor: { type: ['string', 'null'] },
  },
};

const SELECT_MEMBERS = `
  SELECT m.user_id, m.display_name, m.role,
    to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS joined_at,
    to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_utc,
    ci.zalo_name
  FROM memberships m
  LEFT JOIN channel_identities ci ON ci.user_id = m.user_id`;

export function buildListMembersTool(ownerPool: Database): McpTool {
  return {
    name: 'list_members',
    description: LIST_MEMBERS_DESCRIPTION,
    inputSchema: LIST_MEMBERS_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    call: (args) => callListMembers(ownerPool, args),
  };
}

async function callListMembers(ownerPool: Database, args: unknown): Promise<McpToolResult> {
  const params = parseListMembersArgs(args);
  if (params.workspace_id == null) return { text: JSON.stringify({ error: 'workspace_id is required' }), isError: true };
  const where = buildMembersWhere(params);
  const limit = params.limit ?? PAGE_SIZE;
  const { rows } = await ownerPool.query<MemberRow>(
    `${SELECT_MEMBERS} WHERE ${where.toSql()} ORDER BY m.created_at DESC, m.user_id DESC LIMIT ${limit + 1}`,
    where.values,
  );
  return { text: JSON.stringify(toMembersPage(rows, limit)), isError: false };
}

type ListMembersArgs = {
  workspace_id?: string | null;
  role?: string | null;
  limit?: number | null;
  cursor?: string | null;
};

type MemberRow = {
  user_id: string;
  display_name: string;
  role: string;
  joined_at: string;
  created_at_utc: string;
  zalo_name: string | null;
};

function parseListMembersArgs(args: unknown): ListMembersArgs {
  if (typeof args !== 'object' || args === null) return {};
  return args as ListMembersArgs;
}

function buildMembersWhere(params: ListMembersArgs): WhereClause {
  const where = new WhereClause();
  where.require(`m.workspace_id = ${where.bind(params.workspace_id)}`);
  if (params.role != null) where.require(`m.role = ${where.bind(params.role)}`);
  if (params.cursor != null) addCursorCondition(where, params.cursor);
  return where;
}

function addCursorCondition(where: WhereClause, cursorText: string): void {
  const cursor = decodeSearchCursor(cursorText);
  if (cursor === null) return;
  where.require(`(m.created_at, m.user_id) < (${where.bind(cursor.createdAt)}::timestamptz, ${where.bind(cursor.id)}::uuid)`);
}

function toMembersPage(rows: MemberRow[], limit: number): { items: MemberItem[]; next_cursor: string | null } {
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = pageRows[pageRows.length - 1];
  const next_cursor = hasMore && last !== undefined ? encodeSearchCursor({ createdAt: last.created_at_utc, id: last.user_id }) : null;
  return { items: pageRows.map(toMemberItem), next_cursor };
}

type MemberItem = { user_id: string; display_name: string; role: string; joined_at: string; zalo_name: string | null };

function toMemberItem(row: MemberRow): MemberItem {
  return { user_id: row.user_id, display_name: row.display_name, role: row.role, joined_at: row.joined_at, zalo_name: row.zalo_name };
}
