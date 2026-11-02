import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { assembleService } from '../../src/bootstrap/assemble-service.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import { loadSignedFixture, signBody, TEST_APP_ID, TEST_OA_SECRET, type SignedFixture } from '../fixtures/zalo/zalo-fixtures.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const ZALO_ENVIRONMENT: NodeJS.ProcessEnv = {
  MESSAGING_PROVIDER: 'zalo-oa',
  ZALO_APP_ID: TEST_APP_ID,
  ZALO_APP_SECRET: 'sec-1',
  CHANNEL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  PUBLIC_BASE_URL: 'https://x.test',
};

describe('POST /webhooks/zalo', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let alertSink: FakeAlertSink;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    alertSink = new FakeAlertSink();
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

  it('refuses an event for another Zalo app and stores nothing', async () => {
    await connectOa('oa-1');
    const { body } = loadSignedFixture('text-event');

    const response = await postWebhook(signBody(body.replace('"app_id":"app-test"', '"app_id":"other-app"')));

    expect(response.statusCode).toBe(401);
    expect(await database.query('SELECT id FROM inbound_events')).toEqual([]);
  });

  it('refuses an event for an OA that is not connected and stores nothing', async () => {
    await connectOa('oa-1');
    const { body } = loadSignedFixture('text-event');

    const response = await postWebhook(signBody(body.replace('"recipient":{"id":"oa-1"}', '"recipient":{"id":"oa-9"}')));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ ok: false });
    expect(await database.query('SELECT id FROM inbound_events')).toEqual([]);
  });

  it('answers an ignored event and stores nothing', async () => {
    const response = await postWebhook(loadSignedFixture('follow-event'));

    expect(response.statusCode).toBe(200);
    expect(await database.query('SELECT id FROM inbound_events')).toEqual([]);
  });

  it('answers 500 and alerts the operator when it cannot store an event', async () => {
    const refusingPool = createPostgresPool('postgres://nobody:nothing@127.0.0.1:1/none');

    const response = await postWebhook(loadSignedFixture('text-event'), refusingPool);

    await refusingPool.end();
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ ok: false });
    expect(alertSink.texts).toHaveLength(1);
    expect(alertSink.texts[0]).toMatch(/^\[alert\] Zalo webhook could not store an event: \w+\.$/);
  });

  it('answers 503 while the webhook is not configured', async () => {
    const lines: string[] = [];
    const service = assembleService({ ...ZALO_ENVIRONMENT, DATABASE_URL: database.url }, (line) => lines.push(line));
    const { body, headers } = loadSignedFixture('text-event');

    const response = await service.server.inject({ method: 'POST', url: '/webhooks/zalo', headers, body });

    await service.server.close();
    await service.pool.end();
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false });
    expect(await database.query('SELECT id FROM inbound_events')).toEqual([]);
    expect(lines).toEqual(['[config] zalo-webhook is off; missing: ZALO_OA_SECRET.']);
  });

  async function connectOa(accountId: string): Promise<void> {
    const connection = { channel: 'zalo-oa' as const, accountId, tokens: makeTokenPair(), storedAt: new Date() };
    await storeConnection(pool, connection, 'a'.repeat(64));
  }

  function postWebhook(fixture: SignedFixture, webhookPool: PostgresPool = pool) {
    const channel = new ZaloOaChannel({ appId: TEST_APP_ID, oaSecret: TEST_OA_SECRET });
    const alerts = new OperatorAlerts(alertSink, new FakeClock(new Date('2026-11-02T10:00:00+07:00')));
    const server = buildServer(pool, null, { webhook: { channel, database: webhookPool, alerts } });
    return server.inject({ method: 'POST', url: '/webhooks/zalo', headers: fixture.headers, body: fixture.body });
  }
});
