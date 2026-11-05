import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';
import type { McpEndpoint, McpExchange, McpServerDefinition, McpTool } from '../../services/mcp/mcp-endpoint.ts';

export class SdkMcpEndpoint implements McpEndpoint {
  async serve({ name, version, instructions, tools }: McpServerDefinition, { request, response, body }: McpExchange): Promise<void> {
    const server = new McpServer({ name, version }, { instructions });
    for (const tool of tools) registerTool(server, tool);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    response.once('close', () => void server.close());
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  }
}

function registerTool(server: McpServer, { name, description, inputSchema, annotations, securitySchemes, call }: McpTool): void {
  const config = { description, inputSchema: fromJsonSchema(inputSchema), annotations, _meta: { securitySchemes } };
  server.registerTool(name, config, async (args) => {
    const { text, isError } = await call(args);
    return { content: [{ type: 'text', text }], isError };
  });
}
