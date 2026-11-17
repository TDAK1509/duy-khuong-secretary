import type { Database } from '../db/transaction.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { McpTool, McpToolResult } from '../../services/mcp/mcp-endpoint.ts';
import { readCreditHistory } from '../internal-admin/read-credit-history.ts';

const GET_WORKSPACE_HISTORY_DESCRIPTION = `Lấy lịch sử tín dụng của một workspace trong 30 ngày gần nhất.
Get credit history (additions and LLM usage) for a workspace, most recent first.
Requires: workspace_id.`;

const GET_WORKSPACE_HISTORY_SCHEMA = {
  type: 'object',
  required: ['workspace_id'],
  properties: {
    workspace_id: { type: 'string', description: 'UUID of the workspace' },
  },
};

export function buildGetWorkspaceHistoryTool(ownerPool: Database, clock: Clock): McpTool {
  return {
    name: 'get_workspace_history',
    description: GET_WORKSPACE_HISTORY_DESCRIPTION,
    inputSchema: GET_WORKSPACE_HISTORY_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    call: (args) => callGetWorkspaceHistory(ownerPool, clock, args),
  };
}

async function callGetWorkspaceHistory(ownerPool: Database, clock: Clock, args: unknown): Promise<McpToolResult> {
  const params = parseGetWorkspaceHistoryArgs(args);
  if (params.workspace_id == null) return { text: JSON.stringify({ error: 'workspace_id is required' }), isError: true };
  const entries = await readCreditHistory(ownerPool, params.workspace_id, clock.now());
  return { text: JSON.stringify({ entries }), isError: false };
}

type GetWorkspaceHistoryArgs = { workspace_id?: string | null };

function parseGetWorkspaceHistoryArgs(args: unknown): GetWorkspaceHistoryArgs {
  if (typeof args !== 'object' || args === null) return {};
  return args as GetWorkspaceHistoryArgs;
}
