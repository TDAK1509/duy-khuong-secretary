import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import type { ReaderSlots } from '../app/reading/decide-reading.ts';
import { SystemClock } from '../providers/clock/system-clock.ts';
import { OpenAiCompatibleReader } from '../providers/reading/openai-compatible-reader.ts';
import type { Clock } from '../services/clock/clock.ts';
import type { Config } from './config.ts';
import type { ReaderConfig, ReaderSlotConfig } from './reader-config.ts';

export type Providers = {
  pool: PostgresPool;
};

export function buildProvidersFromConfig(config: Config): Providers {
  return { pool: createPostgresPool(config.databaseUrl) };
}

export function buildClock(): Clock {
  return new SystemClock();
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
