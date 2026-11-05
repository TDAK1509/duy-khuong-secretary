import { z } from 'zod';
import type { Clock } from '../../services/clock/clock.ts';
import { describeAuthorizationServer } from '../chatgpt/describe-authorization-server.ts';
import { exchangeAuthorizationCode, type TokenOutcome } from '../chatgpt/exchange-authorization-code.ts';
import { ACCESS_TOKEN_VALID_FOR_MS } from '../chatgpt/issue-tokens.ts';
import { refreshTokens } from '../chatgpt/refresh-tokens.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithJson, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

const codeGrantSchema = z
  .object({ code: z.string(), code_verifier: z.string(), redirect_uri: z.string() })
  .transform(({ code, code_verifier, redirect_uri }) => ({ code, codeVerifier: code_verifier, redirectUri: redirect_uri }));
const refreshGrantSchema = z.object({ refresh_token: z.string() }).transform(({ refresh_token }) => ({ refreshToken: refresh_token }));

export type TokenDependencies = { database: Database; clock: Clock; publicBaseUrl: string };

export function handleAuthorizationServerMetadata(dependencies: TokenDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithJson(200, describeAuthorizationServer(dependencies.publicBaseUrl));
}

export async function handleTokenRequest(dependencies: TokenDependencies | null, body: unknown): Promise<HttpResponse> {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  const now = dependencies.clock.now();
  switch (readGrantType(body)) {
    case 'authorization_code':
      return respondToOutcome(await exchangeAuthorizationCode(dependencies.database, { ...codeGrantSchema.parse(body), now }));
    case 'refresh_token':
      return respondToOutcome(await refreshTokens(dependencies.database, { ...refreshGrantSchema.parse(body), now }));
    default:
      return respondWithJson(400, { error: 'unsupported_grant_type' });
  }
}

function readGrantType(body: unknown): string {
  const parsed = z.object({ grant_type: z.string() }).safeParse(body);
  return parsed.success ? parsed.data.grant_type : '';
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
