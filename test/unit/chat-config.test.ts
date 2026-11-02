import { describe, expect, it } from 'vitest';
import { loadChatConfig } from '../../src/bootstrap/chat-config.ts';

const COMPLETE_ENVIRONMENT: NodeJS.ProcessEnv = {
  CHAT_PROVIDER: 'openai-compatible',
  LLM_BASE_URL: 'https://api.openai.com/v1',
  LLM_API_KEY: 'key',
  LLM_MODEL: 'gpt-6-luna',
};

describe('loadChatConfig', () => {
  it('lists every missing value by name', () => {
    const result = loadChatConfig({ ...COMPLETE_ENVIRONMENT, CHAT_PROVIDER: undefined, LLM_MODEL: '' });

    expect(result).toEqual({ ok: false, missing: ['CHAT_PROVIDER', 'LLM_MODEL'] });
  });

  it('reads the model with the default timeout and the reasoning effort none', () => {
    const result = loadChatConfig(COMPLETE_ENVIRONMENT);

    expect(result).toEqual({
      ok: true,
      config: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'key',
        model: 'gpt-6-luna',
        timeoutMs: 60000,
        reasoningEffort: 'none',
      },
    });
  });

  it('sends no reasoning effort when the value is empty', () => {
    const result = loadChatConfig({ ...COMPLETE_ENVIRONMENT, LLM_REASONING_EFFORT: '' });

    expect(result).toMatchObject({ ok: true, config: { reasoningEffort: undefined } });
  });

  it('reads the timeout and the reasoning effort when set', () => {
    const result = loadChatConfig({ ...COMPLETE_ENVIRONMENT, LLM_TIMEOUT_MS: '30000', LLM_REASONING_EFFORT: 'low' });

    expect(result).toMatchObject({ ok: true, config: { timeoutMs: 30000, reasoningEffort: 'low' } });
  });

  it('refuses a provider other than openai-compatible and names the value', () => {
    expect(() => loadChatConfig({ ...COMPLETE_ENVIRONMENT, CHAT_PROVIDER: 'other' })).toThrow(/CHAT_PROVIDER/);
  });

  it('refuses a base URL that is not a URL and names the value', () => {
    expect(() => loadChatConfig({ ...COMPLETE_ENVIRONMENT, LLM_BASE_URL: 'not a url' })).toThrow(/LLM_BASE_URL/);
  });

  it('refuses a timeout that is not a positive whole number and names the value', () => {
    expect(() => loadChatConfig({ ...COMPLETE_ENVIRONMENT, LLM_TIMEOUT_MS: '0' })).toThrow(/LLM_TIMEOUT_MS/);
  });
});
