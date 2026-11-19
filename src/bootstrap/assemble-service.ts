import type { FastifyInstance } from 'fastify';
import { OperatorAlerts } from '../app/alerts/operator-alerts.ts';
import { runOutboundStep } from '../app/delivery/outbound-step.ts';
import { createInboundHandler } from '../app/processing/handle-inbound-event.ts';
import { runInboundStep } from '../app/processing/inbound-step.ts';
import { HeldEvents } from '../app/processing/held-events.ts';
import { HeldTasks } from '../app/scheduled-runs/held-tasks.ts';
import { OffGroupNotices } from '../app/processing/off-group-notices.ts';
import { checkDatabaseRole } from '../app/db/check-database-role.ts';
import type { CleanupDependencies } from '../app/intake/cleanup-old-photos.ts';
import { runTick, type TickDependencies } from '../app/ticker/run-tick.ts';
import type { ChatServices } from '../services/chat/chat-service.ts';
import type { Clock } from '../services/clock/clock.ts';
import type { MessagingChannel } from '../services/messaging/messaging-channel.ts';
import type { ReaderService } from '../services/reading/reader-service.ts';
import type { PhotoStorage } from '../services/storage/photo-storage.ts';
import type { FileStorage } from '../services/storage/file-storage.ts';
import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import { SdkMcpEndpoint } from '../providers/mcp/sdk-mcp-endpoint.ts';
import { loadConfig, type Config } from './config.ts';
import {
  buildAlertSink,
  buildChatServices,
  buildChannelAuth,
  buildClock,
  buildFileStorage,
  buildMessagingChannel,
  buildPhotoStorage,
  buildDropOffReader,
  buildReader,
} from './from-env.ts';
import { createOwnerReadPool } from './owner-read-pool.ts';
import { loadChatConfig, type ChatConfig } from './chat-config.ts';
import { loadPhotoCleanupConfig } from './photo-cleanup-config.ts';
import { loadPhotoStorageConfig, type PhotoStorageConfig } from './photo-storage-config.ts';
import { loadReportTemplateConfig } from './report-template-config.ts';
import { loadReaderConfig, type ReaderConfig } from './reader-config.ts';
import { buildFileSteps, type FileSteps } from './build-file-steps.ts';
import { buildServer, type ServerOptions } from './server.ts';
import { loadZaloConfig, loadZaloWebhookConfig, type ZaloConfig, type ZaloWebhookConfig } from './zalo-config.ts';

type Readers = { reader: ReaderService | null; dropOffReader: ReaderService | null };

export type Service = {
  config: Config;
  server: FastifyInstance;
  pool: PostgresPool;
  checkDatabaseRole: () => Promise<void>;
  runTick: (shutdown: AbortSignal) => Promise<void>;
  heldTasks: HeldTasks;
  runInboundStep: () => Promise<'processed' | 'idle'>;
  runOutboundStep: () => Promise<'processed' | 'idle'>;
  heldEvents: HeldEvents;
} & FileSteps;

export function assembleService(environment: NodeJS.ProcessEnv, log: (line: string) => void = console.log): Service {
  const configs = loadAllConfigs(environment, log);
  const { pool, ownerPool, clock, alerts, connection, channel, photoStorage, fileStorage, reader, dropOffReader, chats } = buildProviders(configs);
  const heldTasks = new HeldTasks();
  return {
    config: configs.base,
    server: buildServer(pool, configs.base.commit, buildHttpOptions(configs.base, { pool, ownerPool, clock, alerts, connection, channel, webhookConfig: configs.webhookConfig })),
    pool,
    checkDatabaseRole: () => checkDatabaseRole(pool, log),
    runTick: (shutdown) => runTick(buildTickOptions(configs, connection, alerts, channel, chats, pool, clock, environment, photoStorage, { held: heldTasks, shutdown })),
    heldTasks,
    ...buildQueueSteps({ pool, clock, alerts, channel, zalo: configs.zalo, photoStorage, fileStorage, reader, dropOffReader, chats, reportReadyTemplateId: configs.reportReadyTemplateId, log }),
    ...buildFileSteps({ database: pool, clock, channel, fileStorage, reader, log }),
  };
}

type ServiceConfigs = {
  base: Config;
  zalo: ZaloConfig | null;
  webhookConfig: ZaloWebhookConfig | null;
  photoStorageConfig: PhotoStorageConfig | null;
  readerConfig: ReaderConfig | null;
  chatConfig: ChatConfig | null;
  reportReadyTemplateId: string | null;
};

function loadAllConfigs(environment: NodeJS.ProcessEnv, log: (line: string) => void): ServiceConfigs {
  const { zalo, webhookConfig, photoStorageConfig, readerConfig, chatConfig, reportTemplate } = loadGroupConfigs(environment, log);
  return {
    base: loadConfig(environment),
    zalo,
    webhookConfig,
    photoStorageConfig,
    readerConfig,
    chatConfig,
    reportReadyTemplateId: reportTemplate?.templateId ?? null,
  };
}

function loadGroupConfigs(environment: NodeJS.ProcessEnv, log: (line: string) => void) {
  return {
    zalo: readGroupConfig('zalo', loadZaloConfig(environment), log),
    webhookConfig: readGroupConfig('zalo-webhook', loadZaloWebhookConfig(environment), log),
    photoStorageConfig: readGroupConfig('photos', loadPhotoStorageConfig(environment), log),
    readerConfig: readGroupConfig('readers', loadReaderConfig(environment), log),
    chatConfig: readGroupConfig('chat', loadChatConfig(environment), log),
    reportTemplate: readGroupConfig('report-template', loadReportTemplateConfig(environment), log),
  };
}

function readGroupConfig<Config>(
  group: string,
  result: { ok: true; config: Config } | { ok: false; missing: string[] },
  log: (line: string) => void,
): Config | null {
  if (result.ok) return result.config;
  log(`[config] ${group} is off; missing: ${result.missing.join(', ')}.`);
  return null;
}

type ServiceProviders = {
  pool: PostgresPool;
  ownerPool: PostgresPool | null;
  clock: Clock;
  alerts: OperatorAlerts;
  connection: ReturnType<typeof buildConnectionDependencies> | null;
  channel: MessagingChannel | null;
  photoStorage: PhotoStorage | null;
  fileStorage: FileStorage | null;
  reader: ReaderService | null;
  dropOffReader: ReaderService | null;
  chats: ChatServices | null;
};

function buildProviders(configs: ServiceConfigs): ServiceProviders {
  const { pool, ownerPool, clock, alerts } = buildCoreProviders(configs.base);
  const { connection, channel } = buildZaloProviders(configs, pool, clock);
  const { photoStorage, fileStorage, reader, dropOffReader, chats } = buildOptionalServices(configs);
  return { pool, ownerPool, clock, alerts, connection, channel, photoStorage, fileStorage, reader, dropOffReader, chats };
}

function buildCoreProviders(base: Config) {
  const pool = createPostgresPool(base.databaseUrl);
  const ownerPool = base.migrationDatabaseUrl ? createOwnerReadPool(base.migrationDatabaseUrl) : null;
  const clock = buildClock();
  const alerts = new OperatorAlerts(buildAlertSink(base.alert), clock);
  return { pool, ownerPool, clock, alerts };
}

function buildZaloProviders(configs: ServiceConfigs, pool: PostgresPool, clock: Clock) {
  const connection = configs.zalo && buildConnectionDependencies(configs.zalo, pool, clock);
  const channel = configs.zalo && buildMessagingChannel(configs.zalo, configs.webhookConfig?.oaSecret ?? '');
  return { connection, channel };
}

function buildOptionalServices(configs: ServiceConfigs) {
  const photoStorage = configs.photoStorageConfig && buildPhotoStorage(configs.photoStorageConfig);
  const fileStorage = configs.photoStorageConfig && buildFileStorage(configs.photoStorageConfig);
  const reader = configs.readerConfig && buildReader(configs.readerConfig);
  const dropOffReader = configs.readerConfig && buildDropOffReader(configs.readerConfig);
  const chats = configs.chatConfig && buildChatServices(configs.chatConfig);
  return { photoStorage, fileStorage, reader, dropOffReader, chats };
}

function buildConnectionDependencies(zalo: ZaloConfig, pool: PostgresPool, clock: Clock) {
  return { database: pool, channelAuth: buildChannelAuth(zalo, clock), encryptionKey: zalo.encryptionKey, clock };
}

function buildTickOptions(
  configs: ServiceConfigs,
  connection: ReturnType<typeof buildConnectionDependencies> | null,
  alerts: OperatorAlerts,
  channel: MessagingChannel | null,
  chats: ChatServices | null,
  pool: PostgresPool,
  clock: Clock,
  environment: NodeJS.ProcessEnv,
  photoStorage: PhotoStorage | null,
  run: { held: HeldTasks; shutdown: AbortSignal },
): TickDependencies {
  const { zalo } = configs;
  return {
    renewal: zalo && connection && { ...connection, alerts, callTimeoutMs: zalo.oauthTimeoutMs },
    scheduledRuns: channel && chats && { database: pool, clock, chat: chats.scheduledRun, channel, ...run },
    photoCleanup: buildPhotoCleanupDeps(pool, clock, photoStorage, loadPhotoCleanupConfig(environment)),
    shutdown: run.shutdown,
  };
}

function buildPhotoCleanupDeps(pool: PostgresPool, clock: Clock, photoStorage: PhotoStorage | null, config: { retentionDays: number; batchSize: number }): CleanupDependencies | null {
  if (!photoStorage) return null;
  return { database: pool, photoStorage, clock, retentionDays: config.retentionDays, batchSize: config.batchSize };
}

type HttpParts = {
  pool: PostgresPool;
  ownerPool: PostgresPool | null;
  clock: Clock;
  alerts: OperatorAlerts;
  connection: ReturnType<typeof buildConnectionDependencies> | null;
  channel: MessagingChannel | null;
  webhookConfig: ZaloWebhookConfig | null;
};

function buildHttpOptions(config: Config, parts: HttpParts): ServerOptions {
  const { pool, ownerPool, clock, alerts, connection, channel, webhookConfig } = parts;
  return {
    oauthCallback: connection,
    webhook: channel && webhookConfig && { channel, database: pool, alerts },
    internalAdmin: { database: pool, clock },
    internalMcp: ownerPool ? { database: pool, ownerPool, clock, endpoint: new SdkMcpEndpoint() } : null,
    verifierFile: config.verifierFile,
  };
}

type QueueParts = {
  pool: PostgresPool;
  clock: Clock;
  alerts: OperatorAlerts;
  channel: MessagingChannel | null;
  zalo: ZaloConfig | null;
  photoStorage: PhotoStorage | null;
  fileStorage: FileStorage | null;
  reader: ReaderService | null;
  dropOffReader: ReaderService | null;
  chats: ChatServices | null;
  reportReadyTemplateId: string | null;
  log: (line: string) => void;
};

type QueueSteps = Pick<Service, 'runInboundStep' | 'runOutboundStep' | 'heldEvents'>;

function buildQueueSteps({ pool, clock, alerts, channel, zalo, photoStorage, fileStorage, reader, dropOffReader, chats, reportReadyTemplateId, log }: QueueParts): QueueSteps {
  const notices = new OffGroupNotices(clock, log);
  const heldEvents = new HeldEvents();
  const inbound = { ...buildInboundConfig(pool, clock, alerts, notices, channel, zalo, photoStorage, fileStorage, { reader, dropOffReader }, chats), held: heldEvents };
  const outbound = buildOutboundConfig(pool, clock, alerts, notices, channel, zalo, photoStorage, reportReadyTemplateId);
  return {
    runInboundStep: () => runInboundStep(inbound),
    runOutboundStep: async () => (outbound ? runOutboundStep(outbound) : 'idle'),
    heldEvents,
  };
}

function buildInboundConfig(pool: PostgresPool, clock: Clock, alerts: OperatorAlerts, notices: OffGroupNotices, channel: MessagingChannel | null, zalo: ZaloConfig | null, photoStorage: PhotoStorage | null, fileStorage: FileStorage | null, { reader, dropOffReader }: Readers, chats: ChatServices | null) {
  return {
    database: pool,
    clock,
    alerts,
    notices,
    handler: createInboundHandler(
      channel && zalo && { channel, clock, database: pool, encryptionKey: zalo.encryptionKey, photoStorage, fileStorage, reader, dropOffReader, chats },
    ),
  };
}

function buildOutboundConfig(pool: PostgresPool, clock: Clock, alerts: OperatorAlerts, notices: OffGroupNotices, channel: MessagingChannel | null, zalo: ZaloConfig | null, photoStorage: PhotoStorage | null, reportReadyTemplateId: string | null) {
  if (!channel || !zalo) return null;
  return { database: pool, clock, alerts, notices, channel, photoStorage, encryptionKey: zalo.encryptionKey, maxPerMinute: zalo.outboundMaxPerMinute, reportReadyTemplateId };
}
