import { z } from 'zod';
import { hasPrice } from '../app/credits/price-call.ts';
import type { ChatServices } from '../services/chat/chat-service.ts';

const REQUIRED_NAMES = ['CHAT_PROVIDER', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'];

const environmentSchema = z.object({
  CHAT_PROVIDER: z.literal('openai-compatible'),
  LLM_BASE_URL: z.url(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
});

export type ChatTask = keyof ChatServices;

const TASK_VARIABLE_PREFIXES: Record<ChatTask, string> = {
  adminChat: 'ADMIN_CHAT',
  adminReport: 'ADMIN_REPORT',
  memberChat: 'MEMBER_CHAT',
  scheduledRun: 'SCHEDULED_RUN',
};

export type ChatModelSetting = {
  model: string;
  reasoningEffort: string | undefined;
};

export type ChatConfig = {
  provider: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  tasks: Record<ChatTask, ChatModelSetting>;
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
      timeoutMs: settings.LLM_TIMEOUT_MS,
      tasks: {
        adminChat: readModelSetting(environment, 'adminChat'),
        adminReport: readModelSetting(environment, 'adminReport'),
        memberChat: readModelSetting(environment, 'memberChat'),
        scheduledRun: readModelSetting(environment, 'scheduledRun'),
      },
    },
  };
}

function readModelSetting(environment: NodeJS.ProcessEnv, task: ChatTask): ChatModelSetting {
  const prefix = TASK_VARIABLE_PREFIXES[task];
  return {
    model: readPricedModel(environment, environment[`${prefix}_MODEL`] ? `${prefix}_MODEL` : 'LLM_MODEL'),
    reasoningEffort: readReasoningEffort(environment[`${prefix}_REASONING_EFFORT`] ?? environment['LLM_REASONING_EFFORT']),
  };
}

function readPricedModel(environment: NodeJS.ProcessEnv, variableName: string): string {
  const model = environment[variableName] ?? '';
  if (!hasPrice(model)) throw new Error(`Invalid configuration: ${variableName} "${model}" has no price`);
  return model;
}

function readReasoningEffort(value: string | undefined): string | undefined {
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
