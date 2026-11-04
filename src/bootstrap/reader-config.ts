import { z } from 'zod';

const SLOT_PREFIXES = ['READER_CHEAP_1', 'READER_CHEAP_2', 'READER_STRONG_1', 'READER_STRONG_2'];

const REQUIRED_NAMES = [
  'READER_PROVIDER',
  ...SLOT_PREFIXES.flatMap((prefix) => [`${prefix}_BASE_URL`, `${prefix}_API_KEY`, `${prefix}_MODEL`]),
];

const environmentSchema = z.object({
  READER_PROVIDER: z.literal('openai-compatible'),
  READER_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  ...Object.fromEntries(SLOT_PREFIXES.map((prefix) => [`${prefix}_BASE_URL`, z.url()])),
});

export type ReaderSlotConfig = { baseUrl: string; apiKey: string; model: string };
export type ReaderSlotPair = readonly [ReaderSlotConfig, ReaderSlotConfig];

export type ReaderConfig = {
  provider: 'openai-compatible';
  timeoutMs: number;
  reasoningEffort: string | undefined;
  cheap: ReaderSlotPair;
  strong: ReaderSlotPair;
};

export type ReaderConfigResult = { ok: true; config: ReaderConfig } | { ok: false; missing: string[] };

export function loadReaderConfig(suppliedEnvironment: NodeJS.ProcessEnv): ReaderConfigResult {
  const environment = applySharedApiKey(suppliedEnvironment);
  const missing = REQUIRED_NAMES.filter((name) => !environment[name]);
  if (missing.length > 0) return { ok: false, missing };
  const settings = parseSettings(environment);
  return {
    ok: true,
    config: {
      provider: settings.READER_PROVIDER,
      timeoutMs: settings.READER_TIMEOUT_MS,
      reasoningEffort: environment['READER_REASONING_EFFORT'] || undefined,
      cheap: [readSlot(environment, 'READER_CHEAP_1'), readSlot(environment, 'READER_CHEAP_2')],
      strong: [readSlot(environment, 'READER_STRONG_1'), readSlot(environment, 'READER_STRONG_2')],
    },
  };
}

function applySharedApiKey(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sharedKey = environment['LLM_API_KEY'];
  const slotKeys = SLOT_PREFIXES.map((prefix) => [`${prefix}_API_KEY`, environment[`${prefix}_API_KEY`] || sharedKey]);
  return { ...environment, ...Object.fromEntries(slotKeys) };
}

function readSlot(environment: NodeJS.ProcessEnv, prefix: string): ReaderSlotConfig {
  return {
    baseUrl: environment[`${prefix}_BASE_URL`] ?? '',
    apiKey: environment[`${prefix}_API_KEY`] ?? '',
    model: environment[`${prefix}_MODEL`] ?? '',
  };
}

function parseSettings(environment: NodeJS.ProcessEnv): z.infer<typeof environmentSchema> {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
  return parsed.data;
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
