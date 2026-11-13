import { randomUUID } from 'node:crypto';
import { hashSecretToken } from '../../src/app/chatgpt/secret-token.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import type { PostgresPool } from '../../src/providers/database/postgres.ts';
import type { FakeClock } from '../fakes/fake-clock.ts';

export const SESSION_TOKEN = 'session-token-for-tests';

export function getAdminPage(pool: PostgresPool, clock: FakeClock, url: string, token: string | null = SESSION_TOKEN) {
  return buildServer(pool, null, { internalAdmin: { database: pool, clock } }).inject({
    method: 'GET',
    url,
    ...(token !== null && { headers: { cookie: `__Host-internal-session=${token}` } }),
  });
}

export function readTableRows(page: string): string[][] {
  const rows = [...page.matchAll(/<tr>(.*?)<\/tr>/g)].map((row) => [...(row[1] ?? '').matchAll(/<td>(.*?)<\/td>/g)].map((cell) => cell[1] ?? ''));
  return rows.filter((cells) => cells.length > 0);
}

export function makeCsrfToken(sessionToken: string = SESSION_TOKEN): string {
  return hashSecretToken(`csrf:${sessionToken}`);
}

export type CreditsForm = { csrf?: string; request_id?: string; workspace_id: string; credits: string; note: string };

export function postCreditsForm(pool: PostgresPool, clock: FakeClock, form: CreditsForm, token: string | null = SESSION_TOKEN) {
  return buildServer(pool, null, { internalAdmin: { database: pool, clock } }).inject({
    method: 'POST',
    url: '/admin/credits',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(token !== null && { cookie: `__Host-internal-session=${token}` }) },
    payload: new URLSearchParams({ csrf: makeCsrfToken(), request_id: randomUUID(), ...form }).toString(),
  });
}
