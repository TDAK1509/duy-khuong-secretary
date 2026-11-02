import type { FastifyInstance } from 'fastify';
import { OperatorAlerts } from '../app/alerts/operator-alerts.ts';
import { runOutboundStep } from '../app/delivery/outbound-step.ts';
import { createInboundHandler } from '../app/processing/handle-inbound-event.ts';
import { runInboundStep } from '../app/processing/inbound-step.ts';
import { OffGroupNotices } from '../app/processing/off-group-notices.ts';
import { runTick } from '../app/ticker/run-tick.ts';
import type { Clock } from '../services/clock/clock.ts';
import type { MessagingChannel } from '../services/messaging/messaging-channel.ts';
import type { PhotoStorage } from '../services/storage/photo-storage.ts';
import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import { loadConfig, type Config } from './config.ts';
import { buildAlertSink, buildChannelAuth, buildClock, buildMessagingChannel, buildPhotoStorage } from './from-env.ts';
import { loadPhotoStorageConfig } from './photo-storage-config.ts';
import { buildServer, type ServerOptions } from './server.ts';
import { loadZaloConfig, loadZaloWebhookConfig, type ZaloConfig, type ZaloWebhookConfig } from './zalo-config.ts';

export type Service = {
  config: Config;
  server: FastifyInstance;
  pool: PostgresPool;
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
  const server = buildServer(pool, config.commit, buildHttpOptions(config, { pool, alerts, connection, channel, webhookConfig }));
  const renewal = zalo && connection && { ...connection, alerts, callTimeoutMs: zalo.oauthTimeoutMs };
  const photoStorage = readGroupConfig('photos', loadPhotoStorageConfig(environment), log);
  const queueSteps = buildQueueSteps({ pool, clock, alerts, channel, zalo, photoStorage: photoStorage && buildPhotoStorage(photoStorage), log });
  return { config, server, pool, runTick: () => runTick({ renewal }), ...queueSteps };
}

type HttpParts = {
  pool: PostgresPool;
  alerts: OperatorAlerts;
  connection: ReturnType<typeof buildConnectionDependencies> | null;
  channel: MessagingChannel | null;
  webhookConfig: ZaloWebhookConfig | null;
};

function buildHttpOptions(config: Config, parts: HttpParts): ServerOptions {
  const { pool, alerts, connection, channel, webhookConfig } = parts;
  return {
    oauthCallback: connection,
    webhook: channel && webhookConfig && { channel, database: pool, alerts },
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
  log: (line: string) => void;
};

type QueueSteps = Pick<Service, 'runInboundStep' | 'runOutboundStep'>;

function buildQueueSteps({ pool, clock, alerts, channel, zalo, photoStorage, log }: QueueParts): QueueSteps {
  const inbound = {
    database: pool,
    clock,
    alerts,
    notices: new OffGroupNotices(clock, log),
    handler: createInboundHandler(
      channel && zalo && { channel, clock, database: pool, encryptionKey: zalo.encryptionKey, photoStorage },
    ),
  };
  const outbound = channel &&
    zalo && {
      database: pool,
      clock,
      alerts,
      channel,
      encryptionKey: zalo.encryptionKey,
      maxPerMinute: zalo.outboundMaxPerMinute,
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
