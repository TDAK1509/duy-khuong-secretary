import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runOutboundStep } from '../../src/app/delivery/outbound-step.ts';
import { OffGroupNotices } from '../../src/app/processing/off-group-notices.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeMessagingChannel } from '../fakes/fake-messaging-channel.ts';
import { CHATGPT_CLIENT_ID, CHATGPT_REDIRECT_URI, MAX_TEXT_LENGTH, PUBLIC_BASE_URL } from './chatgpt-sign-in-requests.ts';
import { insertConnection } from './chatgpt-connection-rows.ts';
import { insertConfirmedSignIn } from './chatgpt-sign-in-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * ONE_MINUTE_MS;
const ENCRYPTION_KEY = 'a'.repeat(64);
const CODE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const CODE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

describe('announcing a ChatGPT connection in Zalo', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let channel: FakeMessagingChannel;
  let alerts: OperatorAlerts;
  let duyUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    channel = new FakeMessagingChannel();
    alerts = new OperatorAlerts(new FakeAlertSink(), clock);
    await storeConnection(pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens: makeTokenPair({ accessToken: 'a1' }), storedAt: NOW }, ENCRYPTION_KEY);
    const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('tells the admin which workspace a new connection reaches', async () => {
    await insertConfirmedSignIn(database, {
      userId: duyUserId,
      authorizationCode: 'C1',
      codeChallenge: CODE_CHALLENGE,
      expiresAt: new Date(NOW.getTime() + 10 * ONE_MINUTE_MS),
    });

    await requestToken({
      grant_type: 'authorization_code',
      code: 'C1',
      client_id: CHATGPT_CLIENT_ID,
      redirect_uri: CHATGPT_REDIRECT_URI,
      code_verifier: CODE_VERIFIER,
    });
    await sendAllQueuedTexts();

    expect(channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([
      ['zu-duy', 'ChatGPT vừa được kết nối với nhóm "Xe tải Duy Khương". Nếu không phải bạn, nhắn "ngắt ChatGPT" ngay.'],
    ]);
  });

  it('says nothing when a connection refreshes its tokens', async () => {
    await insertConnection(database, {
      userId: duyUserId,
      accessToken: 'A1',
      refreshToken: 'R1',
      refreshExpiresAt: new Date(NOW.getTime() + 30 * ONE_DAY_MS),
    });

    await requestToken({ grant_type: 'refresh_token', refresh_token: 'R1', client_id: CHATGPT_CLIENT_ID });
    await sendAllQueuedTexts();

    expect(channel.texts).toEqual([]);
  });

  async function requestToken(fields: Record<string, string>): Promise<void> {
    const server = buildServer(pool, null, {
      chatgptOAuth: {
        database: pool,
        clock,
        publicBaseUrl: PUBLIC_BASE_URL,
        maxTextLength: MAX_TEXT_LENGTH,
      },
    });
    await server.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams(fields).toString(),
    });
  }

  async function sendAllQueuedTexts(): Promise<void> {
    const outbound = { database: pool, clock, alerts, notices: new OffGroupNotices(clock, () => {}), channel, photoStorage: null, encryptionKey: ENCRYPTION_KEY, maxPerMinute: 90, reportReadyTemplateId: null };
    while ((await runOutboundStep(outbound)) !== 'idle');
  }
});
