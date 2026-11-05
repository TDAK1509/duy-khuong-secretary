import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runOutboundStep } from '../../src/app/delivery/outbound-step.ts';
import { createInboundHandler } from '../../src/app/processing/handle-inbound-event.ts';
import { runInboundStep } from '../../src/app/processing/inbound-step.ts';
import { OffGroupNotices } from '../../src/app/processing/off-group-notices.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeChatService } from '../fakes/fake-chat-service.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeMessagingChannel } from '../fakes/fake-messaging-channel.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { insertConnection } from './chatgpt-connection-rows.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertMembership, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ENCRYPTION_KEY = 'a'.repeat(64);

describe('ending ChatGPT connections from Zalo', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let channel: FakeMessagingChannel;
  let alerts: OperatorAlerts;
  let reader: FakeReader;
  let chat: FakeChatService;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    channel = new FakeMessagingChannel();
    alerts = new OperatorAlerts(new FakeAlertSink(), clock);
    reader = new FakeReader();
    chat = new FakeChatService();
    await storeConnection(pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens: makeTokenPair({ accessToken: 'a1' }), storedAt: NOW }, ENCRYPTION_KEY);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('deletes every connection of the sender and counts them', async () => {
    const xeAId = await insertWorkspace(database, 'Xe A');
    const xeBId = await insertWorkspace(database, 'Xe B');
    const duyUserId = await insertMember(database, { workspaceId: xeAId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await insertMembership(database, { workspaceId: xeBId, userId: duyUserId, displayName: 'Duy', role: 'admin' });
    await insertConnectionOf(duyUserId, { workspaceId: xeAId, token: '1' });
    await insertConnectionOf(duyUserId, { workspaceId: xeBId, token: '2' });

    await receiveText('zu-duy', 'ngắt ChatGPT');
    await sendAllQueuedTexts();

    expect(await database.query('SELECT id FROM chatgpt_connections')).toEqual([]);
    expect(channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([
      ['zu-duy', 'Đã ngắt 2 kết nối ChatGPT của bạn.'],
    ]);
  });

  it('leaves the connections of other admins', async () => {
    const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan', role: 'admin' });
    await insertConnectionOf(duyUserId, { workspaceId, token: '1' });
    await insertConnectionOf(lanUserId, { workspaceId, token: '2' });

    await receiveText('zu-duy', 'ngắt ChatGPT');

    expect(await database.query(`SELECT membership.user_id FROM chatgpt_connections connection
      JOIN memberships membership ON membership.id = connection.membership_id`)).toEqual([{ user_id: lanUserId }]);
  });

  async function insertConnectionOf(userId: string, { workspaceId, token }: { workspaceId: string; token: string }): Promise<void> {
    await insertConnection(database, {
      userId,
      workspaceId,
      accessToken: `A${token}`,
      refreshToken: `R${token}`,
      refreshExpiresAt: new Date(NOW.getTime() + 30 * ONE_DAY_MS),
    });
  }

  async function receiveText(externalUserId: string, text: string): Promise<void> {
    await insertInboundEvent(database, { externalUserId, text });
    await runInboundStep({
      database: pool,
      clock,
      alerts,
      notices: new OffGroupNotices(clock, () => {}),
      handler: createInboundHandler({ channel, clock, database: pool, encryptionKey: ENCRYPTION_KEY, photoStorage: null, reader, chat }),
    });
  }

  async function sendAllQueuedTexts(): Promise<void> {
    const outbound = { database: pool, clock, alerts, notices: new OffGroupNotices(clock, () => {}), channel, photoStorage: null, encryptionKey: ENCRYPTION_KEY, maxPerMinute: 90, reportReadyTemplateId: null };
    while ((await runOutboundStep(outbound)) !== 'idle');
  }
});
