import type { IncomingMessage, ServerResponse } from 'node:http';
import type { JsonSchema } from '../reading/reader-service.ts';
import type { Photo } from '../storage/photo-storage.ts';

export type McpToolAnnotations = { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };

export type McpToolResult = { text: string; isError: boolean; images?: Photo[] };

export type McpTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: McpToolAnnotations;
  securitySchemes: { type: 'oauth2' }[];
  call(args: unknown): Promise<McpToolResult>;
};

export type McpServerDefinition = { name: string; version: string; instructions: string; tools: McpTool[] };

export type McpExchange = { request: IncomingMessage; response: ServerResponse; body: unknown };

export interface McpEndpoint {
  serve(definition: McpServerDefinition, exchange: McpExchange): Promise<void>;
}
