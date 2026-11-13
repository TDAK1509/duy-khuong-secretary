import { z } from 'zod';
import type { Clock } from '../../services/clock/clock.ts';
import type { Database } from '../db/transaction.ts';
import { SESSION_LIFETIME_MS } from '../internal-admin/internal-admin-limits.ts';
import { NOT_INTERNAL_TEXT, WRONG_CODE_TEXT } from '../internal-admin/internal-admin-texts.ts';
import { startInternalSession, type SessionStartOutcome } from '../internal-admin/start-internal-session.ts';
import { renderLoginPage, renderMessagePage } from '../internal-admin/render-admin-page.ts';
import { respondWithHtml, type HttpResponse } from './http-response.ts';

const SESSION_COOKIE = '__Host-internal-session';
const ADMIN_HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
};

export type InternalAdminDependencies = { database: Database; clock: Clock };

export function handleAdminPage(): HttpResponse {
  return addAdminHeaders(respondWithHtml(renderLoginPage(null)));
}

export async function handleAdminLogin(dependencies: InternalAdminDependencies, body: unknown): Promise<HttpResponse> {
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
