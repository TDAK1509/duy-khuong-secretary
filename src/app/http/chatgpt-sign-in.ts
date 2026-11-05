import type { Clock } from '../../services/clock/clock.ts';
import type { QrCodeService } from '../../services/qr-code/qr-code.ts';
import { findConnectedAccountId } from '../channel-auth/find-connected-account.ts';
import { INVALID_REQUEST_TEXT, QR_CAPTION } from '../chatgpt/sign-in-texts.ts';
import { readSignInRequest } from '../chatgpt/read-sign-in-request.ts';
import { renderMessagePage, renderSignInPage } from '../chatgpt/sign-in-page.ts';
import { startSignIn, type SignInRequest } from '../chatgpt/start-sign-in.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithHtml, respondWithText, type HttpResponse } from './http-response.ts';

const BROWSER_KEY_COOKIE = '__Host-chatgpt-sign-in';

export type SignInDependencies = {
  database: Database;
  clock: Clock;
  publicBaseUrl: string;
  qrCode: QrCodeService;
};

export type SignInQuery = Record<string, string | undefined>;

export async function handleSignInPage(dependencies: SignInDependencies | null, query: SignInQuery): Promise<HttpResponse> {
  if (dependencies === null) return respondWithText(503, 'Zalo is not configured.');
  const request = readSignInRequest(query);
  if (request === null) return respondWithHtml(renderMessagePage(INVALID_REQUEST_TEXT), 400);
  return respondWithSignInForm(dependencies, request);
}

async function respondWithSignInForm(dependencies: SignInDependencies, request: SignInRequest): Promise<HttpResponse> {
  const chatUrl = `https://zalo.me/${await findConnectedAccountId(dependencies.database, 'zalo-oa')}`;
  const browserKey = await startSignIn(dependencies.database, request, dependencies.clock.now());
  const page = respondWithHtml(renderSignInPage({ chatUrl, qrSvg: dependencies.qrCode.renderSvg(chatUrl, QR_CAPTION) }));
  return { ...page, headers: { ...page.headers, 'set-cookie': `${BROWSER_KEY_COOKIE}=${browserKey}; Path=/; Secure; HttpOnly; SameSite=Lax` } };
}
