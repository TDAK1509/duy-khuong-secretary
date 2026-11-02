import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHAT_OFF_LINE, PHOTOS_OFF_LINE, READERS_OFF_LINE } from './off-group-lines.ts';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { assembleService } from '../../src/bootstrap/assemble-service.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import { loadSignedFixture, signBody, TEST_APP_ID, TEST_CHANNEL_SETTINGS, TEST_OA_SECRET, type SignedFixture } from '../fixtures/zalo/zalo-fixtures.ts';
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

  it('stores an event through the service assembled from the environment', async () => {
    await connectOa('oa-1');
    const environment = { ...ZALO_ENVIRONMENT, ZALO_OA_SECRET: TEST_OA_SECRET, DATABASE_URL: database.url };
    const service = assembleService(environment, () => {});
    const { body, headers } = loadSignedFixture('text-event');

    const response = await service.server.inject({ method: 'POST', url: '/webhooks/zalo', headers, body });

    await service.server.close();
    await service.pool.end();
    expect(response.statusCode).toBe(200);
    expect(await database.query('SELECT external_event_id FROM inbound_events')).toEqual([
      { external_event_id: 'm1' },
    ]);
  });

  it('answers 500 within 2 seconds and stores nothing while the table is locked', async () => {
    await connectOa('oa-1');
    const locker = await database.openSession();
    await locker.query('BEGIN');
    await locker.query('LOCK TABLE inbound_events IN EXCLUSIVE MODE');
    const startedAt = Date.now();

    const response = await postWebhook(loadSignedFixture('text-event'));

    const elapsedMs = Date.now() - startedAt;
    await locker.query('ROLLBACK');
    expect(response.statusCode).toBe(500);
    expect(elapsedMs).toBeLessThan(2000);
    expect(alertSink.texts).toHaveLength(1);
    expect(await database.query('SELECT id FROM inbound_events')).toEqual([]);
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
    expect(lines).toEqual([
      '[config] zalo-webhook is off; missing: ZALO_OA_SECRET.',
      PHOTOS_OFF_LINE,
      READERS_OFF_LINE,
      CHAT_OFF_LINE,
    ]);
  });

  it('stores the sender, the text and the send time of a text event', async () => {
    await connectOa('oa-1');

    await postWebhook(loadSignedFixture('text-event'));

    expect(await database.query('SELECT channel, account_id, external_user_id, payload FROM inbound_events')).toEqual([
      {
        channel: 'zalo-oa',
        account_id: 'oa-1',
        external_user_id: 'zu-hung',
        payload: { text: 'chào', sent_at: '2026-11-02T03:00:00.000Z' },
      },
    ]);
  });

  it('stores the photo URLs and the caption of an image event', async () => {
    await connectOa('oa-1');

    await postWebhook(loadSignedFixture('two-images-event'));

    expect(await database.query('SELECT kind, payload FROM inbound_events')).toEqual([
      {
        kind: 'images',
        payload: {
          image_urls: ['https://f6.photo.talk.zdn.vn/p1.jpg', 'https://f6.photo.talk.zdn.vn/p2.jpg'],
          caption: null,
          sent_at: '2026-11-02T03:00:00.000Z',
        },
      },
    ]);
  });

  it('checks the signature against the exact bytes it received', async () => {
    await connectOa('oa-1');
    const { body } = loadSignedFixture('text-event');
    const spacedBody = `${JSON.stringify(JSON.parse(body), null, 2).replaceAll('à', '\\u00e0')}\n`;

    const response = await postWebhook(signBody(spacedBody));

    expect(response.statusCode).toBe(200);
  });

  it('refuses an unsigned request of any content type', async () => {
    const response = await postWebhook({
      body: '{"event_name":"user_send_text"}',
      headers: { 'x-zevent-signature': 'mac=00', 'content-type': 'application/x-www-form-urlencoded' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('refuses a body larger than 1 MB', async () => {
    const { headers } = loadSignedFixture('text-event');

    const response = await postWebhook({ body: 'x'.repeat(1_048_577), headers });

    expect(response.statusCode).toBe(413);
  });

  async function connectOa(accountId: string): Promise<void> {
    const connection = { channel: 'zalo-oa' as const, accountId, tokens: makeTokenPair(), storedAt: new Date() };
    await storeConnection(pool, connection, 'a'.repeat(64));
  }

  function postWebhook(fixture: SignedFixture, webhookPool: PostgresPool = pool) {
    const channel = new ZaloOaChannel(TEST_CHANNEL_SETTINGS);
    const alerts = new OperatorAlerts(alertSink, new FakeClock(new Date('2026-11-02T10:00:00+07:00')));
    const server = buildServer(pool, null, { webhook: { channel, database: webhookPool, alerts } });
    return server.inject({ method: 'POST', url: '/webhooks/zalo', headers: fixture.headers, body: fixture.body });
  }
});
