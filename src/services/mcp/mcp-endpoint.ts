import type { IncomingMessage, ServerResponse } from 'node:http';

export type McpTool = { name: string };

export type McpServerDefinition = { name: string; version: string; instructions: string; tools: McpTool[] };

export type McpExchange = { request: IncomingMessage; response: ServerResponse; body: unknown };

export interface McpEndpoint {
  serve(definition: McpServerDefinition, exchange: McpExchange): Promise<void>;
}
