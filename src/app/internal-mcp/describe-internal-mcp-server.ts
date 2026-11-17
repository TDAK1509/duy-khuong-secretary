import type { Database } from '../db/transaction.ts';
import type { McpServerDefinition, McpTool } from '../../services/mcp/mcp-endpoint.ts';
import type { Clock } from '../../services/clock/clock.ts';
import { buildListUsersTool } from './list-users-tool.ts';
import { buildListWorkspacesTool } from './list-workspaces-tool.ts';
import { buildListMembersTool } from './list-members-tool.ts';
import { buildSearchRecordsTool } from './search-records-tool.ts';
import { buildGetWorkspaceHistoryTool } from './get-workspace-history-tool.ts';
import { buildGetUserDetailsTool } from './get-user-details-tool.ts';

export function describeInternalMcpServer(ownerPool: Database, clock: Clock): McpServerDefinition {
  return {
    name: 'internal-secretary',
    version: '1.0.0',
    instructions: 'Internal MCP server for the duy-app-secretary service. Analyst use only.',
    tools: buildInternalMcpTools(ownerPool, clock),
  };
}

function buildInternalMcpTools(ownerPool: Database, clock: Clock): McpTool[] {
  return [
    buildListUsersTool(ownerPool),
    buildListWorkspacesTool(ownerPool),
    buildListMembersTool(ownerPool),
    buildSearchRecordsTool(ownerPool),
    buildGetWorkspaceHistoryTool(ownerPool, clock),
    buildGetUserDetailsTool(ownerPool),
  ];
}
