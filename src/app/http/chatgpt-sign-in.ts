import type { Clock } from '../../services/clock/clock.ts';
import { renderSignInPage } from '../chatgpt/sign-in-page.ts';
import { startSignIn } from '../chatgpt/start-sign-in.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithHtml, respondWithText, type HttpResponse } from './http-response.ts';

const BROWSER_KEY_COOKIE = '__Host-chatgpt-sign-in';

export type SignInDependencies = {
  database: Database;
  clock: Clock;
  publicBaseUrl: string;
};

export type SignInQuery = Record<string, string | undefined>;

export async function handleSignInPage(dependencies: SignInDependencies | null, query: SignInQuery): Promise<HttpResponse> {
  if (dependencies === null) return respondWithText(503, 'Zalo is not configured.');
  const browserKey = await startSignIn(dependencies.database, readSignInRequest(query), dependencies.clock.now());
  const page = respondWithHtml(renderSignInPage());
  return { ...page, headers: { ...page.headers, 'set-cookie': `${BROWSER_KEY_COOKIE}=${browserKey}; Path=/; Secure; HttpOnly; SameSite=Lax` } };
}

function readSignInRequest(query: SignInQuery) {
  return {
    clientId: query['client_id'] ?? '',
    redirectUri: query['redirect_uri'] ?? '',
    state: query['state'] ?? null,
    codeChallenge: query['code_challenge'] ?? '',
  };
}
