import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runOutboundStep } from '../../src/app/delivery/outbound-step.ts';
import { runTick } from '../../src/app/ticker/run-tick.ts';
import { createInboundHandler } from '../../src/app/processing/handle-inbound-event.ts';
import { runInboundStep, type InboundHandler } from '../../src/app/processing/inbound-step.ts';
import type { Stages } from '../../src/app/processing/stages.ts';
import { OffGroupNotices } from '../../src/app/processing/off-group-notices.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeChatService } from '../fakes/fake-chat-service.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeMessagingChannel } from '../fakes/fake-messaging-channel.ts';
import { FakePhotoStorage } from '../fakes/fake-photo-storage.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

export const NOW = new Date('2026-11-02T10:00:00+07:00');
export const ENCRYPTION_KEY = 'a'.repeat(64);
export const PHOTO_URL = 'https://z.test/1.jpg';

export type InboundOverrides = {
  photoStorage?: FakePhotoStorage | null;
  reader?: FakeReader | null;
  chat?: FakeChatService | null;
  beforeFinish?: () => Promise<void>;
};

export type IntakeHarness = {
  database: TemporaryDatabase;
  pool: PostgresPool;
  clock: FakeClock;
  channel: FakeMessagingChannel;
  photoStorage: FakePhotoStorage;
  alerts: OperatorAlerts;
  reader: FakeReader;
  chat: FakeChatService;
  workspaceId: string;
  hungUserId: string;
  receivePhoto(externalUserId: string, caption?: string | null): Promise<void>;
  receiveText(externalUserId: string, text: string, overrides?: InboundOverrides): Promise<void>;
  runInbound(overrides?: InboundOverrides): Promise<unknown>;
  runTick(overrides?: { chat?: FakeChatService | null }): Promise<void>;
  setReportReadyTemplate(templateId: string | null): void;
  sendQueuedTexts(): Promise<void>;
  sendAllQueuedTexts(): Promise<void>;
  close(): Promise<void>;
};

function pauseBeforeFinish(beforeFinish: (() => Promise<void>) | undefined, handler: InboundHandler): InboundHandler {
  if (beforeFinish === undefined) return handler;
  return (event, stages) => handler(event, pauseStages(stages, beforeFinish));
}

function pauseStages(stages: Stages, beforeFinish: () => Promise<void>): Stages {
  return {
    ...stages,
    finishEvent: async (write) => {
      await beforeFinish();
      return stages.finishEvent(write);
    },
    forScope: (scope) => pauseStages(stages.forScope(scope), beforeFinish),
  };
}

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
  const pool = createPostgresPool(database.runtimeUrl);
  const clock = new FakeClock(NOW);
  const channel = new FakeMessagingChannel();
  const photoStorage = new FakePhotoStorage();
  const alerts = new OperatorAlerts(new FakeAlertSink(), clock);
  const reader = new FakeReader();
  const chat = new FakeChatService();
  const tokens = makeTokenPair({ accessToken: 'a1' });
  await storeConnection(pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens, storedAt: NOW }, ENCRYPTION_KEY);
  const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
  const hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });

  function runInbound(overrides: InboundOverrides = {}): Promise<unknown> {
    const storage = overrides.photoStorage === undefined ? photoStorage : overrides.photoStorage;
    const readerService = overrides.reader === undefined ? reader : overrides.reader;
    const chatService = overrides.chat === undefined ? chat : overrides.chat;
    return runInboundStep({
      database: pool,
      clock,
      alerts,
      notices: new OffGroupNotices(clock, () => {}),
      handler: pauseBeforeFinish(overrides.beforeFinish, createInboundHandler({
        channel,
        clock,
        database: pool,
        encryptionKey: ENCRYPTION_KEY,
        photoStorage: storage,
        reader: readerService,
        chat: chatService,
      })),
    });
  }

  let reportReadyTemplateId: string | null = null;

  function outboundDependencies() {
    return {
      database: pool,
      clock,
      alerts,
      notices: new OffGroupNotices(clock, () => {}),
      channel,
      photoStorage,
      encryptionKey: ENCRYPTION_KEY,
      maxPerMinute: 90,
      reportReadyTemplateId,
    };
  }

  return {
    database,
    pool,
    clock,
    channel,
    photoStorage,
    alerts,
    reader,
    chat,
    workspaceId,
    hungUserId,
    runInbound,
    runTick: (overrides = {}) => {
      const chatService = overrides.chat === undefined ? chat : overrides.chat;
      return runTick({ renewal: null, scheduledRuns: chatService && { database: pool, clock, channel, chat: chatService } });
    },
    receivePhoto: async (externalUserId, caption = null) => {
      await insertInboundEvent(database, { externalUserId, kind: 'images', imageUrls: [PHOTO_URL], caption });
      await runInbound();
    },
    receiveText: async (externalUserId, text, overrides) => {
      await insertInboundEvent(database, { externalUserId, text });
      await runInbound(overrides);
    },
    setReportReadyTemplate: (templateId) => {
      reportReadyTemplateId = templateId;
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
