import type { Database } from '../../db/transaction.ts';
import type { McpTool, McpToolResult } from '../../../services/mcp/mcp-endpoint.ts';

const GET_USER_DETAILS_DESCRIPTION = `Lấy thông tin chi tiết của một người dùng.
Get full details for a user: memberships across all workspaces and channel identities.
Requires: user_id.`;

const GET_USER_DETAILS_SCHEMA = {
  type: 'object',
  required: ['user_id'],
  properties: {
    user_id: { type: 'string', description: 'UUID of the user' },
  },
};

const SELECT_USER = `
  SELECT u.id, u.is_internal,
    to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
    COALESCE(
      json_agg(DISTINCT jsonb_build_object(
        'workspace_id', m.workspace_id,
        'workspace_name', w.name,
        'role', m.role,
        'display_name', m.display_name,
        'joined_at', to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      )) FILTER (WHERE m.workspace_id IS NOT NULL),
      '[]'::json
    ) AS memberships,
    COALESCE(
      json_agg(DISTINCT jsonb_build_object(
        'channel', ci.channel,
        'external_user_id', ci.external_user_id,
        'zalo_name', ci.zalo_name,
        'last_inbound_at', to_char(ci.last_inbound_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      )) FILTER (WHERE ci.id IS NOT NULL),
      '[]'::json
    ) AS channel_identities
  FROM users u
  LEFT JOIN memberships m ON m.user_id = u.id
  LEFT JOIN workspaces w ON w.id = m.workspace_id
  LEFT JOIN channel_identities ci ON ci.user_id = u.id`;

export function buildGetUserDetailsTool(ownerPool: Database): McpTool {
  return {
    name: 'get_user_details',
    description: GET_USER_DETAILS_DESCRIPTION,
    inputSchema: GET_USER_DETAILS_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    call: (args) => callGetUserDetails(ownerPool, args),
  };
}

async function callGetUserDetails(ownerPool: Database, args: unknown): Promise<McpToolResult> {
  const params = parseGetUserDetailsArgs(args);
  if (params.user_id == null) return { text: JSON.stringify({ error: 'user_id is required' }), isError: true };
  const { rows } = await ownerPool.query<UserDetailRow>(
    `${SELECT_USER} WHERE u.id = $1 GROUP BY u.id, u.created_at`,
    [params.user_id],
  );
  const user = rows[0];
  if (user === undefined) return { text: JSON.stringify({ error: 'user not found' }), isError: true };
  return { text: JSON.stringify(user), isError: false };
}

type GetUserDetailsArgs = { user_id?: string | null };

type UserDetailRow = {
  id: string;
  is_internal: boolean;
  created_at: string;
  memberships: unknown[];
  channel_identities: unknown[];
};

function parseGetUserDetailsArgs(args: unknown): GetUserDetailsArgs {
  if (typeof args !== 'object' || args === null) return {};
  return args as GetUserDetailsArgs;
}
