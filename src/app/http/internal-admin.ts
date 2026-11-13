import { z } from 'zod';
import { RequestRateLimit } from '../chatgpt/request-rate-limit.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { Database } from '../db/transaction.ts';
import { LOGIN_POST_WINDOW_MS, MAX_LOGIN_POSTS, SESSION_LIFETIME_MS } from '../internal-admin/internal-admin-limits.ts';
import { NOT_INTERNAL_TEXT, TOO_MANY_LOGINS_TEXT, WRONG_CODE_TEXT } from '../internal-admin/internal-admin-texts.ts';
import { startInternalSession, type SessionStartOutcome } from '../internal-admin/start-internal-session.ts';
import { renderLoginPage, renderMessagePage } from '../internal-admin/render-admin-page.ts';
import { respondWithHtml, type HttpResponse } from './http-response.ts';

const SESSION_COOKIE = '__Host-internal-session';
const LOGIN_RATE_LIMIT_KEY = 'internal-login';
const ADMIN_HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
};

export type InternalAdminDependencies = { database: Database; clock: Clock };

export function handleAdminPage(): HttpResponse {
  return addAdminHeaders(respondWithHtml(renderLoginPage(null)));
}

export function createLoginRateLimit(): RequestRateLimit {
  return new RequestRateLimit(MAX_LOGIN_POSTS, LOGIN_POST_WINDOW_MS);
}

export async function handleAdminLogin(dependencies: InternalAdminDependencies, rateLimit: RequestRateLimit, body: unknown): Promise<HttpResponse> {
  if (!rateLimit.allows(LOGIN_RATE_LIMIT_KEY, dependencies.clock.now())) return addAdminHeaders(respondWithHtml(renderMessagePage(TOO_MANY_LOGINS_TEXT), 429));
  const outcome = await startInternalSession(dependencies.database, { typedCode: readTypedCode(body), now: dependencies.clock.now() });
  return addAdminHeaders(respondToLogin(outcome));
}

function addAdminHeaders(response: HttpResponse): HttpResponse {
  return { ...response, headers: { ...response.headers, ...ADMIN_HEADERS } };
}

function respondToLogin(outcome: SessionStartOutcome): HttpResponse {
  if (outcome.kind === 'wrong_code') return respondWithHtml(renderLoginPage(WRONG_CODE_TEXT));
  if (outcome.kind === 'not_internal') return respondWithHtml(renderMessagePage(NOT_INTERNAL_TEXT), 403);
  return { status: 303, headers: { location: '/admin', 'set-cookie': formatSessionCookie(outcome.token) }, body: '' };
}

function formatSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_LIFETIME_MS / 1000}; Secure; HttpOnly; SameSite=Strict`;
}

function readTypedCode(body: unknown): string {
  const parsed = z.object({ code: z.string() }).safeParse(body);
  return parsed.success ? parsed.data.code : '';
}
