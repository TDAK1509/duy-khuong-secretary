import type { Clock } from '../../services/clock/clock.ts';
import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import type { McpEndpoint, McpExchange } from '../../services/mcp/mcp-endpoint.ts';
import { describeProtectedResource } from '../chatgpt/describe-protected-resource.ts';
import { describeMcpServer } from '../chatgpt/describe-mcp-server.ts';
import { findAdminConnection, type AdminConnection } from '../chatgpt/find-admin-connection.ts';
import { RequestRateLimit } from '../chatgpt/request-rate-limit.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithJson, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

const MAX_REQUESTS_PER_MINUTE = 60;
const ONE_MINUTE_MS = 60 * 1000;
const TOO_MANY_REQUESTS_TEXT = 'Too many requests.';

export type McpDependencies = { database: Database; clock: Clock; publicBaseUrl: string; endpoint: McpEndpoint; photoStorage: PhotoStorage | null; reader: ReaderService | null; maxTextLength: number };

export type McpAccess =
  | { kind: 'refused'; response: HttpResponse }
  | { kind: 'granted'; serve: (exchange: McpExchange) => Promise<void> };

export function handleProtectedResourceMetadata(dependencies: McpDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithJson(200, describeProtectedResource(dependencies.publicBaseUrl));
}

export function refuseMcpMethod(): HttpResponse {
  const response = respondWithText(405, 'Method not allowed.');
  return { ...response, headers: { ...response.headers, allow: 'POST' } };
}

export function createMcpRateLimit(): RequestRateLimit {
  return new RequestRateLimit(MAX_REQUESTS_PER_MINUTE, ONE_MINUTE_MS);
}

export async function authorizeMcpRequest(
  dependencies: McpDependencies | null,
  rateLimit: RequestRateLimit,
  authorization: string | undefined,
): Promise<McpAccess> {
  if (dependencies === null) return refuse(respondWithText(503, ZALO_OFF_TEXT));
  const connection = await findCallerConnection(dependencies, authorization);
  if (connection === null) return refuse(respondWithSignInChallenge(dependencies.publicBaseUrl));
  if (!rateLimit.allows(connection.id, dependencies.clock.now())) return refuse(respondWithText(429, TOO_MANY_REQUESTS_TEXT));
  return { kind: 'granted', serve: (exchange) => dependencies.endpoint.serve(describeMcpServer(dependencies, connection.scope), exchange) };
}

async function findCallerConnection(dependencies: McpDependencies, authorization: string | undefined): Promise<AdminConnection | null> {
  const accessToken = readBearerToken(authorization);
  if (accessToken === null) return null;
  return findAdminConnection(dependencies.database, accessToken, dependencies.clock.now());
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
