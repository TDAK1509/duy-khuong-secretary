import { describe, expect, it } from 'vitest';
import { loadReaderConfig } from '../../src/bootstrap/reader-config.ts';

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

describe('loadReaderConfig', () => {
  it('lists every missing value by name', () => {
    const result = loadReaderConfig({ ...COMPLETE_ENVIRONMENT, READER_PROVIDER: undefined, READER_STRONG_2_MODEL: '' });

    expect(result).toEqual({ ok: false, missing: ['READER_PROVIDER', 'READER_STRONG_2_MODEL'] });
  });

  it('reads the four slots with the default timeout and no reasoning effort', () => {
    const result = loadReaderConfig(COMPLETE_ENVIRONMENT);

    expect(result).toEqual({
      ok: true,
      config: {
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
});
