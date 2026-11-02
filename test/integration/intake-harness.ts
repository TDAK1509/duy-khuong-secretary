import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runOutboundStep } from '../../src/app/delivery/outbound-step.ts';
import { createInboundHandler } from '../../src/app/processing/handle-inbound-event.ts';
import { runInboundStep } from '../../src/app/processing/inbound-step.ts';
import { OffGroupNotices } from '../../src/app/processing/off-group-notices.ts';
import type { ReaderSlots } from '../../src/app/reading/decide-reading.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeChatService } from '../fakes/fake-chat-service.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeMessagingChannel } from '../fakes/fake-messaging-channel.ts';
import { FakePhotoStorage } from '../fakes/fake-photo-storage.ts';
import { createFakeReaderSlots, type FakeReaderSlots } from '../fakes/fake-reader-slots.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

export const NOW = new Date('2026-11-02T10:00:00+07:00');
export const ENCRYPTION_KEY = 'a'.repeat(64);
export const PHOTO_URL = 'https://z.test/1.jpg';

export type InboundOverrides = {
  photoStorage?: FakePhotoStorage | null;
  readers?: ReaderSlots | null;
  chat?: FakeChatService | null;
};

export type IntakeHarness = {
  database: TemporaryDatabase;
  pool: PostgresPool;
  clock: FakeClock;
  channel: FakeMessagingChannel;
  photoStorage: FakePhotoStorage;
  alerts: OperatorAlerts;
  readers: FakeReaderSlots;
  chat: FakeChatService;
  workspaceId: string;
  hungUserId: string;
  receivePhoto(externalUserId: string, caption?: string | null): Promise<void>;
  receiveText(externalUserId: string, text: string): Promise<void>;
  runInbound(overrides?: InboundOverrides): Promise<unknown>;
  sendQueuedTexts(): Promise<void>;
  sendAllQueuedTexts(): Promise<void>;
  close(): Promise<void>;
};

export function makePng(size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(1);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

export function makeJpeg(size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(1);
  bytes.set([0xff, 0xd8, 0xff]);
  return bytes;
}

export async function createIntakeHarness(): Promise<IntakeHarness> {
  const database = await createMigratedDatabase();
  const pool = createPostgresPool(database.url);
  const clock = new FakeClock(NOW);
  const channel = new FakeMessagingChannel();
  const photoStorage = new FakePhotoStorage();
  const alerts = new OperatorAlerts(new FakeAlertSink(), clock);
  const readers = createFakeReaderSlots();
  const chat = new FakeChatService();
  const tokens = makeTokenPair({ accessToken: 'a1' });
  await storeConnection(pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens, storedAt: NOW }, ENCRYPTION_KEY);
  const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
  const hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });

  function runInbound(overrides: InboundOverrides = {}): Promise<unknown> {
    const storage = overrides.photoStorage === undefined ? photoStorage : overrides.photoStorage;
    const slots = overrides.readers === undefined ? readers : overrides.readers;
    const chatService = overrides.chat === undefined ? chat : overrides.chat;
    return runInboundStep({
      database: pool,
      clock,
      alerts,
      notices: new OffGroupNotices(clock, () => {}),
      handler: createInboundHandler({
        channel,
        clock,
        database: pool,
        encryptionKey: ENCRYPTION_KEY,
        photoStorage: storage,
        readers: slots,
        chat: chatService,
      }),
    });
  }

  function outboundDependencies() {
    return { database: pool, clock, alerts, notices: new OffGroupNotices(clock, () => {}), channel, photoStorage, encryptionKey: ENCRYPTION_KEY, maxPerMinute: 90 };
  }

  return {
    database,
    pool,
    clock,
    channel,
    photoStorage,
    alerts,
    readers,
    chat,
    workspaceId,
    hungUserId,
    runInbound,
    receivePhoto: async (externalUserId, caption = null) => {
      await insertInboundEvent(database, { externalUserId, kind: 'images', imageUrls: [PHOTO_URL], caption });
      await runInbound();
    },
    receiveText: async (externalUserId, text) => {
      await insertInboundEvent(database, { externalUserId, text });
      await runInbound();
    },
    sendQueuedTexts: async () => {
      await runOutboundStep(outboundDependencies());
    },
    sendAllQueuedTexts: async () => {
      while ((await runOutboundStep(outboundDependencies())) === 'processed');
    },
    close: async () => {
      await pool.end();
      await database.drop();
    },
  };
}
