import { z } from 'zod';
import type { Clock } from '../../services/clock/clock.ts';
import type { QrCodeService } from '../../services/qr-code/qr-code.ts';
import { findConnectedAccountId } from '../channel-auth/find-connected-account.ts';
import { confirmSignIn, type SignInOutcome } from '../chatgpt/confirm-sign-in.ts';
import { readSignInRequest } from '../chatgpt/read-sign-in-request.ts';
import { BUSY_TEXT, EXPIRED_TEXT, INVALID_REQUEST_TEXT, QR_CAPTION, TOO_MANY_ATTEMPTS_TEXT, WRONG_CODE_TEXT } from '../chatgpt/sign-in-texts.ts';
import { renderMessagePage, renderSignInPage } from '../chatgpt/sign-in-page.ts';
import { startSignIn } from '../chatgpt/start-sign-in.ts';
import type { Database } from '../db/transaction.ts';
import { respondWithHtml, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

const BROWSER_KEY_COOKIE = '__Host-chatgpt-sign-in';
const SIGN_IN_HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://chatgpt.com; frame-ancestors 'none'",
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
};

export type SignInDependencies = {
  database: Database;
  clock: Clock;
  publicBaseUrl: string;
  qrCode: QrCodeService;
};

export type SignInQuery = Record<string, string | undefined>;

export type SignInSubmission = { cookieHeader: string | undefined; body: unknown };

export async function handleSignInPage(dependencies: SignInDependencies | null, query: SignInQuery): Promise<HttpResponse> {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return addSignInHeaders(await startSignInPage(dependencies, query));
}

async function startSignInPage(dependencies: SignInDependencies, query: SignInQuery): Promise<HttpResponse> {
  const request = readSignInRequest(query, dependencies.publicBaseUrl);
  if (request === null) return respondWithHtml(renderMessagePage(INVALID_REQUEST_TEXT), 400);
  const page = respondWithHtml(await renderForm(dependencies, null));
  const browserKey = await startSignIn(dependencies.database, request, dependencies.clock.now());
  if (browserKey === null) return respondWithHtml(renderMessagePage(BUSY_TEXT), 429);
  return { ...page, headers: { ...page.headers, 'set-cookie': `${BROWSER_KEY_COOKIE}=${browserKey}; Path=/; Secure; HttpOnly; SameSite=Lax` } };
}

export async function handleSignInSubmission(
  dependencies: SignInDependencies | null,
  submission: SignInSubmission,
): Promise<HttpResponse> {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return addSignInHeaders(await confirmSubmission(dependencies, submission));
}

async function confirmSubmission(dependencies: SignInDependencies, submission: SignInSubmission): Promise<HttpResponse> {
  const outcome = await confirmSignIn(dependencies.database, {
    browserKey: readBrowserKey(submission.cookieHeader),
    typedCode: readTypedCode(submission.body),
    now: dependencies.clock.now(),
  });
  return respondToOutcome(dependencies, outcome);
}

function addSignInHeaders(response: HttpResponse): HttpResponse {
  return { ...response, headers: { ...response.headers, ...SIGN_IN_HEADERS } };
}

async function respondToOutcome(dependencies: SignInDependencies, outcome: SignInOutcome): Promise<HttpResponse> {
  switch (outcome.kind) {
    case 'confirmed':
      return redirectToChatGpt(dependencies, outcome);
    case 'expired':
      return respondWithHtml(renderMessagePage(EXPIRED_TEXT), 403);
    case 'wrong_code':
      return respondWithHtml(await renderForm(dependencies, WRONG_CODE_TEXT));
    case 'too_many_attempts':
      return respondWithHtml(await renderForm(dependencies, TOO_MANY_ATTEMPTS_TEXT));
  }
}

function redirectToChatGpt(dependencies: SignInDependencies, outcome: Extract<SignInOutcome, { kind: 'confirmed' }>): HttpResponse {
  const redirect = new URL(outcome.redirectUri);
  redirect.searchParams.set('code', outcome.authorizationCode);
  if (outcome.state !== null) redirect.searchParams.set('state', outcome.state);
  redirect.searchParams.set('iss', dependencies.publicBaseUrl);
  return { status: 303, headers: { location: redirect.toString() }, body: '' };
}

async function renderForm(dependencies: SignInDependencies, message: string | null): Promise<string> {
  const chatUrl = `https://zalo.me/${await findConnectedAccountId(dependencies.database, 'zalo-oa')}`;
  return renderSignInPage({ chatUrl, qrSvg: dependencies.qrCode.renderSvg(chatUrl, QR_CAPTION), message });
}

function readBrowserKey(cookieHeader: string | undefined): string {
  const cookies = (cookieHeader ?? '').split(';').map((cookie) => cookie.trim());
  const found = cookies.find((cookie) => cookie.startsWith(`${BROWSER_KEY_COOKIE}=`));
  return found?.slice(BROWSER_KEY_COOKIE.length + 1) ?? '';
}

function readTypedCode(body: unknown): string {
  const parsed = z.object({ code: z.string() }).safeParse(body);
  return parsed.success ? parsed.data.code : '';
}
