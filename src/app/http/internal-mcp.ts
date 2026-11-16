import type { Clock } from '../../services/clock/clock.ts';
import type { McpEndpoint, McpExchange } from '../../services/mcp/mcp-endpoint.ts';
import type { Database } from '../db/transaction.ts';
import { authenticateMcpRequest } from '../internal-mcp/authenticate-mcp-request.ts';
import { describeInternalMcpServer } from '../internal-mcp/describe-internal-mcp-server.ts';
import { respondWithText, type HttpResponse } from './http-response.ts';

export type InternalMcpDependencies = {
  database: Database;
  ownerPool: Database;
  clock: Clock;
  endpoint: McpEndpoint;
};

export async function findMcpAccessError(
  deps: InternalMcpDependencies,
  authorization: string | undefined,
): Promise<HttpResponse | null> {
  const result = await authenticateMcpRequest(deps.database, authorization, deps.clock.now());
  if (result.kind === 'unauthenticated') return respondWithText(401, 'Unauthorized');
  if (result.kind === 'forbidden') return respondWithText(403, 'Forbidden');
  return null;
}

export async function serveMcpExchange(deps: InternalMcpDependencies, exchange: McpExchange): Promise<void> {
  const definition = describeInternalMcpServer(deps.ownerPool, deps.clock);
  await deps.endpoint.serve(definition, exchange);
}
