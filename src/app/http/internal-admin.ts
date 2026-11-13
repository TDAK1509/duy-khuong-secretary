import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { RequestRateLimit } from '../chatgpt/request-rate-limit.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { Database } from '../db/transaction.ts';
import { LOGIN_POST_WINDOW_MS, MAX_LOGIN_POSTS, SESSION_LIFETIME_MS } from '../internal-admin/internal-admin-limits.ts';
import { isValidCsrfToken, makeCsrfToken } from '../internal-admin/csrf-token.ts';
import { isUuid } from '../internal-admin/is-uuid.ts';
import { findInternalSessionUser } from '../internal-admin/find-internal-session-user.ts';
import { INVALID_SESSION_TEXT, NOT_INTERNAL_TEXT, TOO_MANY_LOGINS_TEXT, WORKSPACE_NOT_FOUND_TEXT, WRONG_CODE_TEXT } from '../internal-admin/internal-admin-texts.ts';
import { addInternalCredits, readCreditsForm } from '../internal-admin/add-internal-credits.ts';
import { findWorkspaceName } from '../internal-admin/find-workspace-name.ts';
import { readCreditHistory } from '../internal-admin/read-credit-history.ts';
import { readDashboard } from '../internal-admin/read-dashboard.ts';
import { startInternalSession, type SessionStartOutcome } from '../internal-admin/start-internal-session.ts';
import { renderDashboardPage } from '../internal-admin/render-dashboard-page.ts';
import { renderMessagePage } from '../internal-admin/render-document.ts';
import { renderHistoryPage } from '../internal-admin/render-history-page.ts';
import { renderLoginPage } from '../internal-admin/render-login-page.ts';
import { respondWithHtml, type HttpResponse } from './http-response.ts';
import { readCookie } from './read-cookie.ts';

const SESSION_COOKIE = '__Host-internal-session';
const LOGIN_RATE_LIMIT_KEY = 'internal-login';
const ADMIN_HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
};

export type InternalAdminDependencies = { database: Database; clock: Clock };

export async function handleAdminPage(dependencies: InternalAdminDependencies, cookieHeader: string | undefined): Promise<HttpResponse> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  const userId = await findSessionUser(dependencies, token);
  if (userId === null || token === null) return respondWithAdminHtml(renderLoginPage(null));
  return respondWithDashboard(dependencies, token, null);
}

async function respondWithDashboard(dependencies: InternalAdminDependencies, token: string, message: string | null, status = 200): Promise<HttpResponse> {
  const dashboard = await readDashboard(dependencies.database, dependencies.clock.now());
  return respondWithAdminHtml(renderDashboardPage(dashboard, { csrfToken: makeCsrfToken(token), requestId: randomUUID(), message }), status);
}

async function findSessionUser(dependencies: InternalAdminDependencies, token: string | null): Promise<string | null> {
  if (token === null) return null;
  return findInternalSessionUser(dependencies.database, token, dependencies.clock.now());
}

function respondWithAdminHtml(body: string, status = 200): HttpResponse {
  return addAdminHeaders(respondWithHtml(body, status));
}

function addAdminHeaders(response: HttpResponse): HttpResponse {
  return { ...response, headers: { ...response.headers, ...ADMIN_HEADERS } };
}

export async function handleWorkspaceHistory(dependencies: InternalAdminDependencies, cookieHeader: string | undefined, workspaceId: string): Promise<HttpResponse> {
  const userId = await findSessionUser(dependencies, readCookie(cookieHeader, SESSION_COOKIE));
  if (userId === null) return respondWithAdminHtml(renderLoginPage(null));
  const name = await findWorkspaceName(dependencies.database, workspaceId);
  if (name === null) return respondWithAdminHtml(renderMessagePage(WORKSPACE_NOT_FOUND_TEXT), 404);
  const entries = await readCreditHistory(dependencies.database, workspaceId, dependencies.clock.now());
  return respondWithAdminHtml(renderHistoryPage(name, entries));
}

export function createLoginRateLimit(): RequestRateLimit {
  return new RequestRateLimit(MAX_LOGIN_POSTS, LOGIN_POST_WINDOW_MS);
}

export async function handleAdminLogin(dependencies: InternalAdminDependencies, rateLimit: RequestRateLimit, body: unknown): Promise<HttpResponse> {
  if (!rateLimit.allows(LOGIN_RATE_LIMIT_KEY, dependencies.clock.now())) return respondWithAdminHtml(renderMessagePage(TOO_MANY_LOGINS_TEXT), 429);
  const outcome = await startInternalSession(dependencies.database, { typedCode: readTypedCode(body), now: dependencies.clock.now() });
  return addAdminHeaders(respondToLogin(outcome));
}

function readTypedCode(body: unknown): string {
  const parsed = z.object({ code: z.string() }).safeParse(body);
  return parsed.success ? parsed.data.code : '';
}

function respondToLogin(outcome: SessionStartOutcome): HttpResponse {
  if (outcome.kind === 'wrong_code') return respondWithHtml(renderLoginPage(WRONG_CODE_TEXT));
  if (outcome.kind === 'not_internal') return respondWithHtml(renderMessagePage(NOT_INTERNAL_TEXT), 403);
  return { status: 303, headers: { location: '/admin', 'set-cookie': formatSessionCookie(outcome.token) }, body: '' };
}

function formatSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_LIFETIME_MS / 1000}; Secure; HttpOnly; SameSite=Strict`;
}


export async function handleAddCredits(dependencies: InternalAdminDependencies, cookieHeader: string | undefined, body: unknown): Promise<HttpResponse> {
  const form = readCreditsForm(body);
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (token === null || !isValidCsrfToken(token, form.csrf) || !isUuid(form.requestId)) return respondWithAdminHtml(renderMessagePage(INVALID_SESSION_TEXT), 403);
  const userId = await findSessionUser(dependencies, token);
  if (userId === null) return respondWithAdminHtml(renderMessagePage(INVALID_SESSION_TEXT), 403);
  const outcome = await addInternalCredits(dependencies.database, userId, form);
  if (outcome.kind === 'refused') return respondWithDashboard(dependencies, token, outcome.text, 422);
  return { status: 303, headers: { location: '/admin' }, body: '' };
}
