import { z } from 'zod';

const REQUIRED_NAMES = ['CHAT_PROVIDER', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'];

const environmentSchema = z.object({
  CHAT_PROVIDER: z.literal('openai-compatible'),
  LLM_BASE_URL: z.url(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
});

export type ChatConfig = {
  provider: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  reasoningEffort: string | undefined;
};

export type ChatConfigResult = { ok: true; config: ChatConfig } | { ok: false; missing: string[] };

export function loadChatConfig(environment: NodeJS.ProcessEnv): ChatConfigResult {
  const missing = REQUIRED_NAMES.filter((name) => !environment[name]);
  if (missing.length > 0) return { ok: false, missing };
  const settings = parseSettings(environment);
  return {
    ok: true,
    config: {
      provider: settings.CHAT_PROVIDER,
      baseUrl: settings.LLM_BASE_URL,
      apiKey: environment['LLM_API_KEY'] ?? '',
      model: environment['LLM_MODEL'] ?? '',
      timeoutMs: settings.LLM_TIMEOUT_MS,
      reasoningEffort: readReasoningEffort(environment),
    },
  };
}

function readReasoningEffort(environment: NodeJS.ProcessEnv): string | undefined {
  const value = environment['LLM_REASONING_EFFORT'];
  return value === undefined ? 'none' : value || undefined;
}

function parseSettings(environment: NodeJS.ProcessEnv): z.infer<typeof environmentSchema> {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
  return parsed.data;
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
