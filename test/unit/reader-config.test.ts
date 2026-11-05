import { describe, expect, it } from 'vitest';
import { loadReaderConfig } from '../../src/bootstrap/reader-config.ts';

const COMPLETE_ENVIRONMENT: NodeJS.ProcessEnv = {
  READER_PROVIDER: 'openai-compatible',
  READER_BASE_URL: 'https://ai.test/v1',
  READER_API_KEY: 'key',
  READER_MODEL: 'model-x',
};

describe('loadReaderConfig', () => {
  it('uses the set reader values as given', () => {
    const result = loadReaderConfig(COMPLETE_ENVIRONMENT);

    expect(result).toMatchObject({
      ok: true,
      config: { baseUrl: 'https://ai.test/v1', apiKey: 'key', model: 'model-x' },
    });
  });

  it('takes the LLM_API_KEY when READER_API_KEY is empty', () => {
    const result = loadReaderConfig({ READER_PROVIDER: 'openai-compatible', READER_API_KEY: '', LLM_API_KEY: 'sk-shared' });

    expect(result).toMatchObject({ ok: true, config: { apiKey: 'sk-shared' } });
  });

  it('uses the OpenAI URL without READER_BASE_URL', () => {
    const result = loadReaderConfig({ READER_PROVIDER: 'openai-compatible', READER_API_KEY: 'key', READER_MODEL: 'model-x' });

    expect(result).toMatchObject({ ok: true, config: { baseUrl: 'https://api.openai.com/v1' } });
  });

  it('uses gpt-6.1-sol without READER_MODEL', () => {
    const result = loadReaderConfig({ READER_PROVIDER: 'openai-compatible', READER_API_KEY: 'key' });

    expect(result).toMatchObject({ ok: true, config: { model: 'gpt-6.1-sol' } });
  });

  it('lists every missing value by name', () => {
    const result = loadReaderConfig({ ...COMPLETE_ENVIRONMENT, READER_PROVIDER: undefined, READER_API_KEY: '' });

    expect(result).toEqual({ ok: false, missing: ['READER_PROVIDER', 'READER_API_KEY'] });
  });

  it('reads the reader with the default timeout and no reasoning effort', () => {
    const result = loadReaderConfig(COMPLETE_ENVIRONMENT);

    expect(result).toEqual({
      ok: true,
      config: {
        provider: 'openai-compatible',
        baseUrl: 'https://ai.test/v1',
        apiKey: 'key',
        model: 'model-x',
        timeoutMs: 60000,
        reasoningEffort: undefined,
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
    const environment = { ...COMPLETE_ENVIRONMENT, READER_BASE_URL: 'not a url' };

    expect(() => loadReaderConfig(environment)).toThrow(/READER_BASE_URL/);
  });

  it('refuses a timeout that is not a positive whole number and names the value', () => {
    expect(() => loadReaderConfig({ ...COMPLETE_ENVIRONMENT, READER_TIMEOUT_MS: '0' })).toThrow(/READER_TIMEOUT_MS/);
  });
});
