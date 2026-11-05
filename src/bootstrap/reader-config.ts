import { z } from 'zod';

const REQUIRED_NAMES = ['READER_PROVIDER', 'READER_BASE_URL', 'READER_API_KEY', 'READER_MODEL'];

const environmentSchema = z.object({
  READER_PROVIDER: z.literal('openai-compatible'),
  READER_BASE_URL: z.url(),
  READER_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
});

export type ReaderConfig = {
  provider: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  reasoningEffort: string | undefined;
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
      baseUrl: settings.READER_BASE_URL,
      apiKey: environment['READER_API_KEY'] ?? '',
      model: environment['READER_MODEL'] ?? '',
      timeoutMs: settings.READER_TIMEOUT_MS,
      reasoningEffort: environment['READER_REASONING_EFFORT'] || undefined,
    },
  };
}

function applySharedApiKey(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...environment, READER_API_KEY: environment['READER_API_KEY'] || environment['LLM_API_KEY'] };
}

function parseSettings(environment: NodeJS.ProcessEnv): z.infer<typeof environmentSchema> {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
  return parsed.data;
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
