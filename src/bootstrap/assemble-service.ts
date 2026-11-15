import type { FastifyInstance } from 'fastify';
import { OperatorAlerts } from '../app/alerts/operator-alerts.ts';
import { runOutboundStep } from '../app/delivery/outbound-step.ts';
import { createInboundHandler } from '../app/processing/handle-inbound-event.ts';
import { runInboundStep } from '../app/processing/inbound-step.ts';
import { OffGroupNotices } from '../app/processing/off-group-notices.ts';
import { checkDatabaseRole } from '../app/db/check-database-role.ts';
import { runTick } from '../app/ticker/run-tick.ts';
import type { ChatService } from '../services/chat/chat-service.ts';
import type { Clock } from '../services/clock/clock.ts';
import type { MessagingChannel } from '../services/messaging/messaging-channel.ts';
import type { ReaderService } from '../services/reading/reader-service.ts';
import type { FileStorage } from '../services/storage/file-storage.ts';
import type { PhotoStorage } from '../services/storage/photo-storage.ts';
import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import { loadConfig, type Config } from './config.ts';
import {
  buildAlertSink,
  buildChatService,
  buildChannelAuth,
  buildClock,
  buildFileStorage,
  buildMessagingChannel,
  buildPhotoStorage,
  buildReader,
} from './from-env.ts';
import { loadChatConfig, type ChatConfig } from './chat-config.ts';
import { loadPhotoStorageConfig, type PhotoStorageConfig } from './photo-storage-config.ts';
import { loadReportTemplateConfig } from './report-template-config.ts';
import { loadReaderConfig, type ReaderConfig } from './reader-config.ts';
import { buildServer, type ServerOptions } from './server.ts';
import { loadZaloConfig, loadZaloWebhookConfig, type ZaloConfig, type ZaloWebhookConfig } from './zalo-config.ts';

export type Service = {
  config: Config;
  server: FastifyInstance;
  pool: PostgresPool;
  checkDatabaseRole: () => Promise<void>;
  runTick: () => Promise<void>;
  runInboundStep: () => Promise<'processed' | 'idle'>;
  runOutboundStep: () => Promise<'processed' | 'idle'>;
};

export function assembleService(environment: NodeJS.ProcessEnv, log: (line: string) => void = console.log): Service {
  const config = loadConfig(environment);
  const pool = createPostgresPool(config.databaseUrl);
  const clock = buildClock();
  const alerts = new OperatorAlerts(buildAlertSink(config.alert), clock);
  const configs = loadOptionalConfigs(environment, log);
  const services = buildOptionalServices(configs, pool, clock, alerts);
  const server = buildServer(pool, config.commit, buildHttpOptions(config, { pool, clock, alerts, webhookConfig: configs.webhookConfig, ...services }));
  const scheduledRuns = services.channel && services.chat && { database: pool, clock, chat: services.chat, channel: services.channel };
  const queueSteps = buildQueueSteps({ pool, clock, alerts, ...services, ...configs, log });
  return { config, server, pool, checkDatabaseRole: () => checkDatabaseRole(pool, log), runTick: () => runTick({ renewal: services.renewal, scheduledRuns }), ...queueSteps };
}

type OptionalConfigs = {
  zalo: ZaloConfig | null;
  webhookConfig: ZaloWebhookConfig | null;
  photoStorageConfig: PhotoStorageConfig | null;
  chatConfig: ChatConfig | null;
  readerConfig: ReaderConfig | null;
  reportReadyTemplateId: string | null;
};

function loadOptionalConfigs(environment: NodeJS.ProcessEnv, log: (line: string) => void): OptionalConfigs {
  const zalo = readGroupConfig('zalo', loadZaloConfig(environment), log);
  const webhookConfig = readGroupConfig('zalo-webhook', loadZaloWebhookConfig(environment), log);
  const photoStorageConfig = readGroupConfig('photos', loadPhotoStorageConfig(environment), log);
  const chatConfig = readGroupConfig('chat', loadChatConfig(environment), log);
  const readerConfig = readGroupConfig('readers', loadReaderConfig(environment), log);
  const reportTemplate = readGroupConfig('report-template', loadReportTemplateConfig(environment), log);
  return { zalo, webhookConfig, photoStorageConfig, chatConfig, readerConfig, reportReadyTemplateId: reportTemplate?.templateId ?? null };
}

type OptionalServices = {
  connection: ReturnType<typeof buildConnectionDependencies> | null;
  channel: MessagingChannel | null;
  fileStorage: FileStorage | null;
  photoStorage: PhotoStorage | null;
  reader: ReaderService | null;
  chat: ChatService | null;
  renewal: ReturnType<typeof buildRenewal> | null;
};

function buildOptionalServices(configs: OptionalConfigs, pool: PostgresPool, clock: Clock, alerts: OperatorAlerts): OptionalServices {
  const connection = configs.zalo && buildConnectionDependencies(configs.zalo, pool, clock);
  const channel = configs.zalo && buildMessagingChannel(configs.zalo, configs.webhookConfig?.oaSecret ?? '');
  const photoStorage = configs.photoStorageConfig && buildPhotoStorage(configs.photoStorageConfig);
  const fileStorage = configs.photoStorageConfig && buildFileStorage(configs.photoStorageConfig);
  const reader = configs.readerConfig && buildReader(configs.readerConfig);
  const chat = configs.chatConfig && buildChatService(configs.chatConfig);
  const renewal = configs.zalo && connection && buildRenewal(connection, alerts, configs.zalo.oauthTimeoutMs);
  return { connection, channel, photoStorage, fileStorage, reader, chat, renewal };
}

function buildRenewal(connection: ReturnType<typeof buildConnectionDependencies>, alerts: OperatorAlerts, callTimeoutMs: number) {
  return { ...connection, alerts, callTimeoutMs };
}

type HttpParts = {
  pool: PostgresPool;
  clock: Clock;
  alerts: OperatorAlerts;
  connection: OptionalServices['connection'];
  channel: MessagingChannel | null;
  webhookConfig: ZaloWebhookConfig | null;
};

function buildHttpOptions(config: Config, parts: HttpParts): ServerOptions {
  const { pool, clock, alerts, connection, channel, webhookConfig } = parts;
  return {
    oauthCallback: connection,
    webhook: channel && webhookConfig && { channel, database: pool, alerts },
    internalAdmin: { database: pool, clock },
    verifierFile: config.verifierFile,
  };
}

type QueueParts = OptionalServices &
  OptionalConfigs & {
    pool: PostgresPool;
    clock: Clock;
    alerts: OperatorAlerts;
    log: (line: string) => void;
  };

type QueueSteps = Pick<Service, 'runInboundStep' | 'runOutboundStep'>;

function buildQueueSteps(parts: QueueParts): QueueSteps {
  const notices = new OffGroupNotices(parts.clock, parts.log);
  const inbound = { ...buildInboundConfig(parts, notices), handler: buildInboundHandler(parts) };
  const outbound = buildOutboundConfig(parts, notices);
  return {
    runInboundStep: () => runInboundStep(inbound),
    runOutboundStep: async () => (outbound ? runOutboundStep(outbound) : 'idle'),
  };
}

function buildInboundConfig(parts: QueueParts, notices: OffGroupNotices) {
  return { database: parts.pool, clock: parts.clock, alerts: parts.alerts, notices };
}

function buildInboundHandler(parts: QueueParts) {
  const { channel, zalo, clock, pool, fileStorage, photoStorage, reader, chat } = parts;
  return createInboundHandler(
    channel && zalo && { channel, clock, database: pool, encryptionKey: zalo.encryptionKey, fileStorage, photoStorage, reader, chat },
  );
}

function buildOutboundConfig(parts: QueueParts, notices: OffGroupNotices) {
  const { channel, zalo, pool, clock, alerts, photoStorage, reportReadyTemplateId } = parts;
  return channel && zalo && { database: pool, clock, alerts, notices, channel, photoStorage, encryptionKey: zalo.encryptionKey, maxPerMinute: zalo.outboundMaxPerMinute, reportReadyTemplateId };
}

function buildConnectionDependencies(zalo: ZaloConfig, pool: PostgresPool, clock: Clock) {
  return { database: pool, channelAuth: buildChannelAuth(zalo, clock), encryptionKey: zalo.encryptionKey, clock };
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
