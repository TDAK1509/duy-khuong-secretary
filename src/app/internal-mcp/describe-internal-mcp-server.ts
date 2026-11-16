import type { Database } from '../db/transaction.ts';
import type { McpServerDefinition } from '../../services/mcp/mcp-endpoint.ts';
import { buildListUsersTool } from './list-users-tool.ts';
import { buildListWorkspacesTool } from './list-workspaces-tool.ts';
import { buildListMembersTool } from './list-members-tool.ts';

export function describeInternalMcpServer(ownerPool: Database): McpServerDefinition {
  return {
    name: 'internal-secretary',
    version: '1.0.0',
    instructions: 'Internal MCP server for the duy-app-secretary service. Analyst use only.',
    tools: [buildListUsersTool(ownerPool), buildListWorkspacesTool(ownerPool), buildListMembersTool(ownerPool)],
  };
}
