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
import type { PhotoStorage } from '../services/storage/photo-storage.ts';
import { SdkMcpEndpoint } from '../providers/mcp/sdk-mcp-endpoint.ts';
import { QrCodeGeneratorRenderer } from '../providers/qr-code/qrcode-generator-renderer.ts';
import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import { loadConfig, type Config } from './config.ts';
import {
  buildAlertSink,
  buildChatService,
  buildChannelAuth,
  buildClock,
  buildMessagingChannel,
  buildPhotoStorage,
  buildReader,
} from './from-env.ts';
import { loadChatConfig } from './chat-config.ts';
import { loadPhotoStorageConfig } from './photo-storage-config.ts';
import { loadReportTemplateConfig } from './report-template-config.ts';
import { loadReaderConfig } from './reader-config.ts';
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
  const zalo = readGroupConfig('zalo', loadZaloConfig(environment), log);
  const webhookConfig = readGroupConfig('zalo-webhook', loadZaloWebhookConfig(environment), log);
  const pool = createPostgresPool(config.databaseUrl);
  const clock = buildClock();
  const alerts = new OperatorAlerts(buildAlertSink(config.alert), clock);
  const connection = zalo && buildConnectionDependencies(zalo, pool, clock);
  const channel = zalo && buildMessagingChannel(zalo, webhookConfig?.oaSecret ?? '');
  const photoStorageConfig = readGroupConfig('photos', loadPhotoStorageConfig(environment), log);
  const photoStorage = photoStorageConfig && buildPhotoStorage(photoStorageConfig);
  const readerConfig = readGroupConfig('readers', loadReaderConfig(environment), log);
  const reader = readerConfig && buildReader(readerConfig);
  const server = buildServer(pool, config.commit, buildHttpOptions(config, { pool, clock, alerts, connection, channel, webhookConfig, zalo, photoStorage, reader }));
  const renewal = zalo && connection && { ...connection, alerts, callTimeoutMs: zalo.oauthTimeoutMs };
  const chatConfig = readGroupConfig('chat', loadChatConfig(environment), log);
  const reportTemplate = readGroupConfig('report-template', loadReportTemplateConfig(environment), log);
  const chat = chatConfig && buildChatService(chatConfig);
  const queueSteps = buildQueueSteps({
    pool,
    clock,
    alerts,
    channel,
    zalo,
    photoStorage,
    reader,
    chat,
    reportReadyTemplateId: reportTemplate && reportTemplate.templateId,
    log,
  });
  const scheduledRuns = channel && chat && { database: pool, clock, chat, channel };
  return {
    config,
    server,
    pool,
    checkDatabaseRole: () => checkDatabaseRole(pool, log),
    runTick: () => runTick({ renewal, scheduledRuns }),
    ...queueSteps,
  };
}

type HttpParts = {
  pool: PostgresPool;
  clock: Clock;
  zalo: ZaloConfig | null;
  alerts: OperatorAlerts;
  connection: ReturnType<typeof buildConnectionDependencies> | null;
  channel: MessagingChannel | null;
  webhookConfig: ZaloWebhookConfig | null;
  photoStorage: PhotoStorage | null;
  reader: ReaderService | null;
};

function buildHttpOptions(config: Config, parts: HttpParts): ServerOptions {
  const { pool, clock, zalo, alerts, connection, channel, webhookConfig, photoStorage, reader } = parts;
  return {
    oauthCallback: connection,
    chatgptOAuth: zalo && channel && {
      database: pool,
      clock,
      publicBaseUrl: zalo.publicBaseUrl,
      maxTextLength: channel.maxTextLength,
      qrCode: new QrCodeGeneratorRenderer(),
    },
    chatgptMcp: zalo && { database: pool, clock, publicBaseUrl: zalo.publicBaseUrl, endpoint: new SdkMcpEndpoint(), photoStorage, reader },
    webhook: channel && webhookConfig && { channel, database: pool, alerts },
    internalAdmin: { database: pool, clock },
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
  reader: ReaderService | null;
  chat: ChatService | null;
  reportReadyTemplateId: string | null;
  log: (line: string) => void;
};

type QueueSteps = Pick<Service, 'runInboundStep' | 'runOutboundStep'>;

function buildQueueSteps({ pool, clock, alerts, channel, zalo, photoStorage, reader, chat, reportReadyTemplateId, log }: QueueParts): QueueSteps {
  const notices = new OffGroupNotices(clock, log);
  const inbound = {
    database: pool,
    clock,
    alerts,
    notices,
    handler: createInboundHandler(
      channel && zalo && { channel, clock, database: pool, encryptionKey: zalo.encryptionKey, photoStorage, reader, chat },
    ),
  };
  const outbound = channel &&
    zalo && {
      database: pool,
      clock,
      alerts,
      notices,
      channel,
      photoStorage,
      encryptionKey: zalo.encryptionKey,
      maxPerMinute: zalo.outboundMaxPerMinute,
      reportReadyTemplateId,
    };
  return {
    runInboundStep: () => runInboundStep(inbound),
    runOutboundStep: async () => (outbound ? runOutboundStep(outbound) : 'idle'),
  };
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
