import type { Clock } from '../../services/clock/clock.ts';
import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import type { McpEndpoint } from '../../services/mcp/mcp-endpoint.ts';
import { describeProtectedResource } from '../chatgpt/describe-protected-resource.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithJson, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

export type McpDependencies = { database: Database; clock: Clock; publicBaseUrl: string; endpoint: McpEndpoint; photoStorage: PhotoStorage | null; reader: ReaderService | null; maxTextLength: number };

export function handleProtectedResourceMetadata(dependencies: McpDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithJson(200, describeProtectedResource(dependencies.publicBaseUrl));
}

export function refuseMcpMethod(): HttpResponse {
  const response = respondWithText(405, 'Method not allowed.');
  return { ...response, headers: { ...response.headers, allow: 'POST' } };
}
