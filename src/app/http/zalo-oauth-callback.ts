import type { ChannelAuth, TokenPair } from '../../services/channel-auth/channel-auth.ts';
import type { Clock } from '../../services/clock/clock.ts';
import { openConnectState } from '../channel-auth/connect-state.ts';
import { storeConnection } from '../channel-auth/store-connection.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithText, type HttpResponse } from './http-response.ts';

export type OAuthCallbackDependencies = {
  database: Database;
  channelAuth: ChannelAuth;
  encryptionKey: string;
  clock: Clock;
};

export type OAuthCallbackQuery = Record<string, string | undefined>;

export async function handleZaloOAuthCallback(
  dependencies: OAuthCallbackDependencies | null,
  query: OAuthCallbackQuery,
): Promise<HttpResponse> {
  if (dependencies === null) return respondWithText(503, 'Zalo is not configured.');
  const { oa_id: accountId, code, state } = query;
  const codeVerifier = openConnectState(state ?? '', dependencies.clock.now(), dependencies.encryptionKey);
  if (!accountId || !code || codeVerifier === null) return respondWithConnectionFailure();
  const exchange = await dependencies.channelAuth.exchangeAuthorization({ code, codeVerifier });
  if (!exchange.ok) return respondWithConnectionFailure();
  await storeOaConnection(dependencies, accountId, exchange.tokens);
  return respondWithText(200, `Zalo OA ${accountId} connected.`);
}

function storeOaConnection(dependencies: OAuthCallbackDependencies, accountId: string, tokens: TokenPair): Promise<void> {
  const connection = { channel: 'zalo-oa' as const, accountId, tokens, storedAt: dependencies.clock.now() };
  return storeConnection(dependencies.database, connection, dependencies.encryptionKey);
}

function respondWithConnectionFailure(): HttpResponse {
  return respondWithText(400, 'Zalo connection failed. Run connect-zalo again.');
}
