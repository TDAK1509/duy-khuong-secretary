import { describe, expect, it } from 'vitest';
import { loadReaderConfig, type ReaderConfig } from '../../src/bootstrap/reader-config.ts';

const COMPLETE_ENVIRONMENT: NodeJS.ProcessEnv = {
  READER_PROVIDER: 'openai-compatible',
  READER_CHEAP_1_BASE_URL: 'https://api.openai.com/v1',
  READER_CHEAP_1_API_KEY: 'key',
  READER_CHEAP_1_MODEL: 'gpt-6-luna',
  READER_CHEAP_2_BASE_URL: 'https://api.openai.com/v1',
  READER_CHEAP_2_API_KEY: 'key',
  READER_CHEAP_2_MODEL: 'gpt-6.1-terra',
  READER_STRONG_1_BASE_URL: 'https://api.openai.com/v1',
  READER_STRONG_1_API_KEY: 'key',
  READER_STRONG_1_MODEL: 'gpt-6.1-sol',
  READER_STRONG_2_BASE_URL: 'https://api.openai.com/v1',
  READER_STRONG_2_API_KEY: 'key',
  READER_STRONG_2_MODEL: 'gpt-6-astra',
};

const ENVIRONMENT_WITHOUT_SLOT_KEYS: NodeJS.ProcessEnv = {
  ...COMPLETE_ENVIRONMENT,
  READER_CHEAP_1_API_KEY: undefined,
  READER_CHEAP_2_API_KEY: undefined,
  READER_STRONG_1_API_KEY: undefined,
  READER_STRONG_2_API_KEY: undefined,
};

describe('loadReaderConfig', () => {
  it('gives every slot without its own key the LLM_API_KEY', () => {
    const result = loadReaderConfig({ ...ENVIRONMENT_WITHOUT_SLOT_KEYS, LLM_API_KEY: 'sk-shared' });

    expect(result.ok && readSlotKeys(result.config)).toEqual(['sk-shared', 'sk-shared', 'sk-shared', 'sk-shared']);
  });

  it('keeps the own key of a slot over the LLM_API_KEY', () => {
    const result = loadReaderConfig({
      ...ENVIRONMENT_WITHOUT_SLOT_KEYS,
      LLM_API_KEY: 'sk-shared',
      READER_STRONG_2_API_KEY: 'sk-own',
    });

    expect(result.ok && readSlotKeys(result.config)).toEqual(['sk-shared', 'sk-shared', 'sk-shared', 'sk-own']);
  });

  it('lists every missing value by name', () => {
    const result = loadReaderConfig({ ...COMPLETE_ENVIRONMENT, READER_PROVIDER: undefined, READER_STRONG_2_MODEL: '' });

    expect(result).toEqual({ ok: false, missing: ['READER_PROVIDER', 'READER_STRONG_2_MODEL'] });
  });

  it('reads the four slots with the default timeout and no reasoning effort', () => {
    const result = loadReaderConfig(COMPLETE_ENVIRONMENT);

    expect(result).toEqual({
      ok: true,
      config: {
        provider: 'openai-compatible',
        timeoutMs: 60000,
        reasoningEffort: undefined,
        cheap: [
          { baseUrl: 'https://api.openai.com/v1', apiKey: 'key', model: 'gpt-6-luna' },
          { baseUrl: 'https://api.openai.com/v1', apiKey: 'key', model: 'gpt-6.1-terra' },
        ],
        strong: [
          { baseUrl: 'https://api.openai.com/v1', apiKey: 'key', model: 'gpt-6.1-sol' },
          { baseUrl: 'https://api.openai.com/v1', apiKey: 'key', model: 'gpt-6-astra' },
        ],
      },
    });
  });

  it('reads the timeout and the reasoning effort when set', () => {
    const result = loadReaderConfig({
      ...COMPLETE_ENVIRONMENT,
      READER_TIMEOUT_MS: '30000',
      READER_REASONING_EFFORT: 'low',
    });

    expect(result).toMatchObject({ ok: true, config: { timeoutMs: 30000, reasoningEffort: 'low' } });
  });

  it('sends no reasoning effort when the value is empty', () => {
    const result = loadReaderConfig({ ...COMPLETE_ENVIRONMENT, READER_REASONING_EFFORT: '' });

    expect(result).toMatchObject({ ok: true, config: { reasoningEffort: undefined } });
  });

  it('refuses a provider other than openai-compatible and names the value', () => {
    expect(() => loadReaderConfig({ ...COMPLETE_ENVIRONMENT, READER_PROVIDER: 'other' })).toThrow(/READER_PROVIDER/);
  });

  it('refuses a base URL that is not a URL and names the value', () => {
    const environment = { ...COMPLETE_ENVIRONMENT, READER_CHEAP_2_BASE_URL: 'not a url' };

    expect(() => loadReaderConfig(environment)).toThrow(/READER_CHEAP_2_BASE_URL/);
  });

  it('refuses a timeout that is not a positive whole number and names the value', () => {
    expect(() => loadReaderConfig({ ...COMPLETE_ENVIRONMENT, READER_TIMEOUT_MS: '0' })).toThrow(/READER_TIMEOUT_MS/);
  });
});

function readSlotKeys(config: ReaderConfig): string[] {
  return [...config.cheap, ...config.strong].map((slot) => slot.apiKey);
}
