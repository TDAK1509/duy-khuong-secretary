import type { Clock } from '../../services/clock/clock.ts';
import type { Database } from '../db/transaction.ts';
import { renderLoginPage } from '../internal-admin/render-admin-page.ts';
import { respondWithHtml, type HttpResponse } from './http-response.ts';

const ADMIN_HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
};

export type InternalAdminDependencies = { database: Database; clock: Clock };

export function handleAdminPage(): HttpResponse {
  return addAdminHeaders(respondWithHtml(renderLoginPage(null)));
}

function addAdminHeaders(response: HttpResponse): HttpResponse {
  return { ...response, headers: { ...response.headers, ...ADMIN_HEADERS } };
}
