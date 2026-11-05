import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import type { McpEndpoint, McpExchange, McpServerDefinition } from '../../services/mcp/mcp-endpoint.ts';

export class SdkMcpEndpoint implements McpEndpoint {
  async serve({ name, version, instructions, tools }: McpServerDefinition, { request, response, body }: McpExchange): Promise<void> {
    const server = new McpServer({ name, version }, { instructions });
    for (const tool of tools) server.registerTool(tool.name, {}, async () => ({ content: [] }));
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    response.once('close', () => void server.close());
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  }
}
