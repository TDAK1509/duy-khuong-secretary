import type { Clock } from '../../services/clock/clock.ts';
import { describeAuthorizationServer } from '../chatgpt/describe-authorization-server.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithJson, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

export type TokenDependencies = { database: Database; clock: Clock; publicBaseUrl: string; maxTextLength: number };

export function handleAuthorizationServerMetadata(dependencies: TokenDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithJson(200, describeAuthorizationServer(dependencies.publicBaseUrl));
}
