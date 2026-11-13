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
