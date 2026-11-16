import { buildServer } from '../../src/bootstrap/server.ts';
import { SdkMcpEndpoint } from '../../src/providers/mcp/sdk-mcp-endpoint.ts';
import type { PostgresPool } from '../../src/providers/database/postgres.ts';
import type { FakeClock } from '../fakes/fake-clock.ts';

export const BEARER_TOKEN = 'mcp-bearer-token-for-tests';

const TOOLS_LIST_REQUEST = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

export function postMcp(pool: PostgresPool, ownerPool: PostgresPool, clock: FakeClock, body: unknown, token: string | null = BEARER_TOKEN) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'accept': 'application/json, text/event-stream',
  };
  if (token !== null) headers['authorization'] = `Bearer ${token}`;
  return buildServer(pool, null, {
    internalMcp: { database: pool, ownerPool, clock, endpoint: new SdkMcpEndpoint() },
  }).inject({ method: 'POST', url: '/mcp', headers, payload: JSON.stringify(body) });
}

export function listTools(pool: PostgresPool, ownerPool: PostgresPool, clock: FakeClock) {
  return postMcp(pool, ownerPool, clock, TOOLS_LIST_REQUEST);
}

export function callListUsers(pool: PostgresPool, ownerPool: PostgresPool, clock: FakeClock, args: Record<string, unknown> = {}) {
  return postMcp(pool, ownerPool, clock, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'list_users', arguments: args },
  });
}

export function parseToolResult(responseBody: string): unknown {
  const jsonRpc = JSON.parse(responseBody) as { result: { content: { text: string }[] } };
  return JSON.parse(jsonRpc.result.content[0]?.text ?? 'null');
}
