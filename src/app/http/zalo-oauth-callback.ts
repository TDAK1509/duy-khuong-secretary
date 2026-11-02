import type { ChannelAuth } from '../../services/channel-auth/channel-auth.ts';
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
  const codeVerifier = openConnectState(query['state'] ?? '', dependencies.clock.now(), dependencies.encryptionKey);
  if (codeVerifier === null) return respondWithConnectionFailure();
  const exchange = await dependencies.channelAuth.exchangeAuthorization({
    code: query['code'] ?? '',
    codeVerifier,
  });
  if (!exchange.ok) return respondWithConnectionFailure();
  const accountId = query['oa_id'] ?? '';
  await storeConnection(
    dependencies.database,
    { channel: 'zalo-oa', accountId, tokens: exchange.tokens, storedAt: dependencies.clock.now() },
    dependencies.encryptionKey,
  );
  return respondWithText(200, `Zalo OA ${accountId} connected.`);
}

function respondWithConnectionFailure(): HttpResponse {
  return respondWithText(400, 'Zalo connection failed. Run connect-zalo again.');
}
