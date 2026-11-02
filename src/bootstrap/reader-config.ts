const SLOT_PREFIXES = ['READER_CHEAP_1', 'READER_CHEAP_2', 'READER_STRONG_1', 'READER_STRONG_2'];

const REQUIRED_NAMES = [
  'READER_PROVIDER',
  ...SLOT_PREFIXES.flatMap((prefix) => [`${prefix}_BASE_URL`, `${prefix}_API_KEY`, `${prefix}_MODEL`]),
];

export type ReaderSlotConfig = { baseUrl: string; apiKey: string; model: string };
export type ReaderSlotPair = readonly [ReaderSlotConfig, ReaderSlotConfig];

export type ReaderConfig = {
  timeoutMs: number;
  reasoningEffort: string | undefined;
  cheap: ReaderSlotPair;
  strong: ReaderSlotPair;
};

export type ReaderConfigResult = { ok: true; config: ReaderConfig } | { ok: false; missing: string[] };

export function loadReaderConfig(environment: NodeJS.ProcessEnv): ReaderConfigResult {
  const missing = REQUIRED_NAMES.filter((name) => !environment[name]);
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    config: {
      timeoutMs: Number(environment['READER_TIMEOUT_MS'] ?? 60000),
      reasoningEffort: environment['READER_REASONING_EFFORT'],
      cheap: [readSlot(environment, 'READER_CHEAP_1'), readSlot(environment, 'READER_CHEAP_2')],
      strong: [readSlot(environment, 'READER_STRONG_1'), readSlot(environment, 'READER_STRONG_2')],
    },
  };
}

function readSlot(environment: NodeJS.ProcessEnv, prefix: string): ReaderSlotConfig {
  return {
    baseUrl: environment[`${prefix}_BASE_URL`] ?? '',
    apiKey: environment[`${prefix}_API_KEY`] ?? '',
    model: environment[`${prefix}_MODEL`] ?? '',
  };
}
