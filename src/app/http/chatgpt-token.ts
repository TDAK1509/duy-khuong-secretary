import { z } from 'zod';
import type { Clock } from '../../services/clock/clock.ts';
import { describeAuthorizationServer } from '../chatgpt/describe-authorization-server.ts';
import { exchangeAuthorizationCode, type TokenOutcome } from '../chatgpt/exchange-authorization-code.ts';
import { ACCESS_TOKEN_VALID_FOR_MS } from '../chatgpt/issue-tokens.ts';
import { refreshTokens } from '../chatgpt/refresh-tokens.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithJson, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

const codeGrantSchema = z.object({ code: z.string(), code_verifier: z.string(), redirect_uri: z.string() });
const refreshGrantSchema = z.object({ refresh_token: z.string() });

export type TokenDependencies = { database: Database; clock: Clock; publicBaseUrl: string };

export function handleAuthorizationServerMetadata(dependencies: TokenDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithJson(200, describeAuthorizationServer(dependencies.publicBaseUrl));
}

export async function handleTokenRequest(dependencies: TokenDependencies | null, body: unknown): Promise<HttpResponse> {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondToOutcome(await requestTokens(dependencies, body));
}

function requestTokens(dependencies: TokenDependencies, body: unknown): Promise<TokenOutcome> {
  const now = dependencies.clock.now();
  if (z.object({ grant_type: z.literal('refresh_token') }).safeParse(body).success) {
    const { refresh_token: refreshToken } = refreshGrantSchema.parse(body);
    return refreshTokens(dependencies.database, { refreshToken, now });
  }
  const { code, code_verifier: codeVerifier, redirect_uri: redirectUri } = codeGrantSchema.parse(body);
  return exchangeAuthorizationCode(dependencies.database, { code, codeVerifier, redirectUri, now });
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
