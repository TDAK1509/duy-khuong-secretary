import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import type { ReaderSlots } from '../app/reading/decide-reading.ts';
import type { ChannelAuth } from '../services/channel-auth/channel-auth.ts';
import { ZaloOaAuth } from '../providers/channel-auth/zalo-oa-auth.ts';
import { SystemClock } from '../providers/clock/system-clock.ts';
import { OpenAiCompatibleReader } from '../providers/reading/openai-compatible-reader.ts';
import type { Clock } from '../services/clock/clock.ts';
import type { AlertSink } from '../services/alerts/alert-sink.ts';
import { LogAlertSink } from '../providers/alerts/log-alert-sink.ts';
import { WebhookAlertSink } from '../providers/alerts/webhook-alert-sink.ts';
import type { AlertConfig, Config } from './config.ts';
import type { ReaderConfig, ReaderSlotConfig } from './reader-config.ts';
import type { ZaloConfig } from './zalo-config.ts';

const ZALO_OAUTH_TIMEOUT_MS = 15_000;

export type Providers = {
  pool: PostgresPool;
};

export function buildProvidersFromConfig(config: Config): Providers {
  return { pool: createPostgresPool(config.databaseUrl) };
}

export function buildClock(): Clock {
  return new SystemClock();
}

export function buildAlertSink(config: AlertConfig): AlertSink {
  switch (config.provider) {
    case 'log':
      return new LogAlertSink();
    case 'webhook':
      return new WebhookAlertSink(config.webhookUrl);
  }
}

export function buildChannelAuth(config: ZaloConfig, clock: Clock): ChannelAuth {
  switch (config.provider) {
    case 'zalo-oa':
      return new ZaloOaAuth({
        appId: config.appId,
        appSecret: config.appSecret,
        oauthBaseUrl: config.oauthBaseUrl,
        timeoutMs: ZALO_OAUTH_TIMEOUT_MS,
        clock,
      });
  }
}

export function buildReaderSlots(config: ReaderConfig): ReaderSlots {
  switch (config.provider) {
    case 'openai-compatible':
      return {
        cheap: [buildOpenAiReader(config, config.cheap[0]), buildOpenAiReader(config, config.cheap[1])],
        strong: [buildOpenAiReader(config, config.strong[0]), buildOpenAiReader(config, config.strong[1])],
      };
  }
}

function buildOpenAiReader(config: ReaderConfig, slot: ReaderSlotConfig): OpenAiCompatibleReader {
  return new OpenAiCompatibleReader({ ...slot, timeoutMs: config.timeoutMs, reasoningEffort: config.reasoningEffort });
}
