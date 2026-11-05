import { z } from 'zod';
import type { Clock } from '../../services/clock/clock.ts';
import { describeAuthorizationServer } from '../chatgpt/describe-authorization-server.ts';
import { exchangeAuthorizationCode, type TokenOutcome } from '../chatgpt/exchange-authorization-code.ts';
import { ACCESS_TOKEN_VALID_FOR_MS } from '../chatgpt/issue-tokens.ts';
import { CHATGPT_CLIENT_ID } from '../chatgpt/read-sign-in-request.ts';
import { refreshTokens } from '../chatgpt/refresh-tokens.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithJson, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

const codeGrantSchema = z
  .object({
    code: z.string(),
    code_verifier: z.string(),
    redirect_uri: z.string(),
    resource: z.string().optional(),
    client_id: z.literal(CHATGPT_CLIENT_ID),
  })
  .transform(({ code, code_verifier, redirect_uri, resource }) => ({ code, codeVerifier: code_verifier, redirectUri: redirect_uri, resource }));
const refreshGrantSchema = z
  .object({ refresh_token: z.string(), client_id: z.literal(CHATGPT_CLIENT_ID) })
  .transform(({ refresh_token }) => ({ refreshToken: refresh_token }));

export type TokenDependencies = { database: Database; clock: Clock; publicBaseUrl: string };

export function handleAuthorizationServerMetadata(dependencies: TokenDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithJson(200, describeAuthorizationServer(dependencies.publicBaseUrl));
}

export async function handleTokenRequest(dependencies: TokenDependencies | null, body: unknown): Promise<HttpResponse> {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return forbidCaching(await respondToGrant(dependencies, body));
}

async function respondToGrant(dependencies: TokenDependencies, body: unknown): Promise<HttpResponse> {
  switch (readGrantType(body)) {
    case undefined:
      return respondWithError('invalid_request');
    case 'authorization_code':
      return respondToCodeGrant(dependencies, body);
    case 'refresh_token':
      return respondToRefreshGrant(dependencies, body);
    default:
      return respondWithError('unsupported_grant_type');
  }
}

function forbidCaching(response: HttpResponse): HttpResponse {
  return { ...response, headers: { ...response.headers, 'cache-control': 'no-store' } };
}

function readGrantType(body: unknown): string | undefined {
  const parsed = z.object({ grant_type: z.string() }).safeParse(body);
  return parsed.success ? parsed.data.grant_type : undefined;
}

async function respondToCodeGrant(dependencies: TokenDependencies, body: unknown): Promise<HttpResponse> {
  const grant = codeGrantSchema.safeParse(body);
  if (!grant.success) return respondWithError('invalid_request');
  const { resource, ...exchange } = grant.data;
  if (resource !== undefined && resource !== `${dependencies.publicBaseUrl}/mcp`) return respondWithError('invalid_grant');
  return respondToOutcome(await exchangeAuthorizationCode(dependencies.database, { ...exchange, now: dependencies.clock.now() }));
}

async function respondToRefreshGrant(dependencies: TokenDependencies, body: unknown): Promise<HttpResponse> {
  const grant = refreshGrantSchema.safeParse(body);
  if (!grant.success) return respondWithError('invalid_request');
  return respondToOutcome(await refreshTokens(dependencies.database, { ...grant.data, now: dependencies.clock.now() }));
}

function respondWithError(error: string): HttpResponse {
  return respondWithJson(400, { error });
}

function respondToOutcome(outcome: TokenOutcome): HttpResponse {
  if (outcome.kind === 'invalid_grant') return respondWithError('invalid_grant');
  return respondWithJson(200, {
    access_token: outcome.tokens.accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_VALID_FOR_MS / 1000,
    refresh_token: outcome.tokens.refreshToken,
  });
}
