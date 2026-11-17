import { z } from 'zod';
import { hasPrice } from '../app/credits/price-call.ts';

const REQUIRED_NAMES = ['READER_PROVIDER', 'READER_API_KEY'];

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-6.1-sol';

const environmentSchema = z.object({
  READER_PROVIDER: z.literal('openai-compatible'),
  READER_BASE_URL: z.url(),
  READER_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
});

export type ReaderModelSetting = { model: string; reasoningEffort: string | undefined };

export type ReaderConfig = {
  provider: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  photo: ReaderModelSetting;
  text: ReaderModelSetting;
};

export type ReaderConfigResult = { ok: true; config: ReaderConfig } | { ok: false; missing: string[] };

export function loadReaderConfig(suppliedEnvironment: NodeJS.ProcessEnv): ReaderConfigResult {
  const environment = applyDefaults(suppliedEnvironment);
  const missing = REQUIRED_NAMES.filter((name) => !environment[name]);
  if (missing.length > 0) return { ok: false, missing };
  const settings = parseSettings(environment);
  return {
    ok: true,
    config: {
      provider: settings.READER_PROVIDER,
      baseUrl: settings.READER_BASE_URL,
      apiKey: environment['READER_API_KEY'] ?? '',
      timeoutMs: settings.READER_TIMEOUT_MS,
      photo: readModelSetting(environment, 'READER_PHOTO'),
      text: readModelSetting(environment, 'READER_TEXT'),
    },
  };
}

function readModelSetting(environment: NodeJS.ProcessEnv, prefix: 'READER_PHOTO' | 'READER_TEXT'): ReaderModelSetting {
  const modelName = environment[`${prefix}_MODEL`] ? `${prefix}_MODEL` : 'READER_MODEL';
  const reasoningEffort = environment[`${prefix}_REASONING_EFFORT`] ?? environment['READER_REASONING_EFFORT'];
  return { model: readPricedModel(environment, modelName), reasoningEffort: reasoningEffort || undefined };
}

function readPricedModel(environment: NodeJS.ProcessEnv, variableName: string): string {
  const model = environment[variableName] ?? '';
  if (!hasPrice(model)) throw new Error(`Invalid configuration: ${variableName} "${model}" has no price`);
  return model;
}

function applyDefaults(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...environment,
    READER_API_KEY: environment['READER_API_KEY'] || environment['LLM_API_KEY'],
    READER_BASE_URL: environment['READER_BASE_URL'] || DEFAULT_BASE_URL,
    READER_MODEL: environment['READER_MODEL'] || DEFAULT_MODEL,
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
