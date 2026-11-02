import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import type { ReaderSlots } from '../app/reading/decide-reading.ts';
import type { ChannelAuth } from '../services/channel-auth/channel-auth.ts';
import { ZaloOaAuth } from '../providers/channel-auth/zalo-oa-auth.ts';
import { ZaloOaChannel } from '../providers/messaging/zalo-oa-channel.ts';
import { SystemClock } from '../providers/clock/system-clock.ts';
import { OpenAiCompatibleChat } from '../providers/chat/openai-compatible-chat.ts';
import type { ChatService } from '../services/chat/chat-service.ts';
import { OpenAiCompatibleReader } from '../providers/reading/openai-compatible-reader.ts';
import type { MessagingChannel } from '../services/messaging/messaging-channel.ts';
import type { Clock } from '../services/clock/clock.ts';
import type { AlertSink } from '../services/alerts/alert-sink.ts';
import { LogAlertSink } from '../providers/alerts/log-alert-sink.ts';
import { WebhookAlertSink } from '../providers/alerts/webhook-alert-sink.ts';
import { S3PhotoStorage } from '../providers/storage/s3-photo-storage.ts';
import type { PhotoStorage } from '../services/storage/photo-storage.ts';
import type { AlertConfig, Config } from './config.ts';
import type { ChatConfig } from './chat-config.ts';
import type { PhotoStorageConfig } from './photo-storage-config.ts';
import type { ReaderConfig, ReaderSlotConfig } from './reader-config.ts';
import type { ZaloConfig } from './zalo-config.ts';

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
        timeoutMs: config.oauthTimeoutMs,
        clock,
      });
  }
}

export function buildMessagingChannel(config: ZaloConfig, oaSecret: string): MessagingChannel {
  switch (config.provider) {
    case 'zalo-oa':
      return new ZaloOaChannel({
        appId: config.appId,
        oaSecret,
        apiBaseUrl: config.apiBaseUrl,
        timeoutMs: config.apiTimeoutMs,
        mediaHosts: config.mediaHosts,
      });
  }
}

export function buildPhotoStorage(config: PhotoStorageConfig): PhotoStorage {
  switch (config.provider) {
    case 's3':
      return new S3PhotoStorage(config);
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

export function buildChatService(config: ChatConfig): ChatService {
  switch (config.provider) {
    case 'openai-compatible':
      return new OpenAiCompatibleChat(config);
  }
}
