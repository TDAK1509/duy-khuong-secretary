import { z } from 'zod';
import { describeAuthorizationServer } from '../chatgpt/describe-authorization-server.ts';
import { exchangeAuthorizationCode, type TokenOutcome } from '../chatgpt/exchange-authorization-code.ts';
import { ACCESS_TOKEN_VALID_FOR_MS } from '../chatgpt/issue-tokens.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithJson, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

export type TokenDependencies = { database: Database; clock: Clock; publicBaseUrl: string };

export function handleAuthorizationServerMetadata(dependencies: TokenDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithJson(200, describeAuthorizationServer(dependencies.publicBaseUrl));
}

export async function handleTokenRequest(dependencies: TokenDependencies | null, body: unknown): Promise<HttpResponse> {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  const { code, code_verifier: codeVerifier } = z.object({ code: z.string(), code_verifier: z.string() }).parse(body);
  const outcome = await exchangeAuthorizationCode(dependencies.database, { code, codeVerifier, now: dependencies.clock.now() });
  return respondToOutcome(outcome);
}

function respondToOutcome(outcome: TokenOutcome): HttpResponse {
  if (outcome.kind === 'invalid_grant') return respondWithJson(400, { error: 'invalid_grant' });
  return respondWithJson(200, {
    access_token: outcome.tokens.accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_VALID_FOR_MS / 1000,
    refresh_token: outcome.tokens.refreshToken,
  });
}
