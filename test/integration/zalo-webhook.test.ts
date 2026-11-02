import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import { loadSignedFixture, TEST_APP_ID, TEST_OA_SECRET, type SignedFixture } from '../fixtures/zalo/zalo-fixtures.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

describe('POST /webhooks/zalo', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('stores a signed text event as queued', async () => {
    await connectOa('oa-1');

    const response = await postWebhook(loadSignedFixture('text-event'));

    expect(response.statusCode).toBe(200);
    expect(await database.query('SELECT kind, status, external_event_id FROM inbound_events')).toEqual([
      { kind: 'text', status: 'queued', external_event_id: 'm1' },
    ]);
  });

  it('stores a resent event once', async () => {
    await connectOa('oa-1');
    await postWebhook(loadSignedFixture('text-event'));

    const response = await postWebhook(loadSignedFixture('text-event'));

    expect(response.statusCode).toBe(200);
    expect(await database.query('SELECT external_event_id FROM inbound_events')).toEqual([
      { external_event_id: 'm1' },
    ]);
  });

  it('refuses a forged request and stores nothing', async () => {
    await connectOa('oa-1');
    const { body } = loadSignedFixture('text-event');

    const response = await postWebhook({ body, headers: { 'x-zevent-signature': 'mac=00' } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false });
    expect(await database.query('SELECT id FROM inbound_events')).toEqual([]);
  });

  async function connectOa(accountId: string): Promise<void> {
    const connection = { channel: 'zalo-oa' as const, accountId, tokens: makeTokenPair(), storedAt: new Date() };
    await storeConnection(pool, connection, 'a'.repeat(64));
  }

  function postWebhook(fixture: SignedFixture) {
    const channel = new ZaloOaChannel({ appId: TEST_APP_ID, oaSecret: TEST_OA_SECRET });
    const server = buildServer(pool, null, { webhook: { channel, database: pool } });
    return server.inject({ method: 'POST', url: '/webhooks/zalo', headers: fixture.headers, body: fixture.body });
  }
});
