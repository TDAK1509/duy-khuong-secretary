import type { Clock } from '../../services/clock/clock.ts';
import type { McpEndpoint, McpExchange } from '../../services/mcp/mcp-endpoint.ts';
import type { AccessScope } from '../access/access-scope.ts';
import { describeProtectedResource } from '../chatgpt/describe-protected-resource.ts';
import { findAdminScope } from '../chatgpt/find-admin-scope.ts';
import { MCP_SERVER_DEFINITION } from '../chatgpt/mcp-server-definition.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithJson, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

export type McpDependencies = { database: Database; clock: Clock; publicBaseUrl: string; endpoint: McpEndpoint };

export type McpAccess =
  | { kind: 'refused'; response: HttpResponse }
  | { kind: 'granted'; serve: (exchange: McpExchange) => Promise<void> };

export function handleProtectedResourceMetadata(dependencies: McpDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithJson(200, describeProtectedResource(dependencies.publicBaseUrl));
}

export async function authorizeMcpRequest(dependencies: McpDependencies | null, authorization: string | undefined): Promise<McpAccess> {
  if (dependencies === null) return refuse(respondWithText(503, ZALO_OFF_TEXT));
  const scope = await findCallerScope(dependencies, authorization);
  if (scope === null) return refuse(respondWithSignInChallenge(dependencies.publicBaseUrl));
  return { kind: 'granted', serve: (exchange) => dependencies.endpoint.serve(MCP_SERVER_DEFINITION, exchange) };
}

async function findCallerScope(dependencies: McpDependencies, authorization: string | undefined): Promise<AccessScope | null> {
  const accessToken = readBearerToken(authorization);
  if (accessToken === null) return null;
  return findAdminScope(dependencies.database, accessToken, dependencies.clock.now());
}

function refuse(response: HttpResponse): McpAccess {
  return { kind: 'refused', response };
}

function readBearerToken(authorization: string | undefined): string | null {
  const match = /^Bearer (.+)$/i.exec(authorization ?? '');
  return match?.[1] ?? null;
}

function respondWithSignInChallenge(publicBaseUrl: string): HttpResponse {
  const response = respondWithText(401, 'Unauthorized.');
  const metadataUrl = `${publicBaseUrl}/.well-known/oauth-protected-resource`;
  return { ...response, headers: { ...response.headers, 'www-authenticate': `Bearer resource_metadata="${metadataUrl}"` } };
}
