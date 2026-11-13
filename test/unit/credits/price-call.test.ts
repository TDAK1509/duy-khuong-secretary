import { describe, expect, it } from 'vitest';
import { priceCall } from '../../../src/app/credits/price-call.ts';
import type { TokenUsage } from '../../../src/services/usage/token-usage.ts';

function makeUsage(tokens: Partial<TokenUsage>): TokenUsage {
  return { input: 0, cachedInput: 0, cacheWrite: 0, output: 0, reasoning: 0, ...tokens };
}

describe('priceCall', () => {
  it('prices a photo read from its tokens', () => {
    const price = priceCall('gpt-6.1-sol', makeUsage({ input: 5700, output: 1500 }));

    expect(price).toEqual({ costUsd: '0.026400000', credits: '39.600' });
  });

  it('prices a text read from its tokens', () => {
    const price = priceCall('gpt-6.1-sol', makeUsage({ input: 4300, output: 50 }));

    expect(price).toEqual({ costUsd: '0.009100000', credits: '13.650' });
  });

  it('bills cached input tokens at the cached rate and not twice', () => {
    const price = priceCall('gpt-6.1-sol', makeUsage({ input: 5700, cachedInput: 4000 }));

    expect(price).toEqual({ costUsd: '0.003800000', credits: '5.700' });
  });

  it('bills cache-write tokens at the write rate instead of the input rate', () => {
    const price = priceCall('gpt-6.1-sol', makeUsage({ input: 5700, cacheWrite: 5000 }));

    expect(price).toEqual({ costUsd: '0.013900000', credits: '20.850' });
  });

  it('prices the chat model with its own rates', () => {
    const price = priceCall('gpt-6-luna', makeUsage({ input: 10000, output: 200 }));

    expect(price).toEqual({ costUsd: '0.001100000', credits: '1.650' });
  });

  it('rounds credits half-up to 0.001', () => {
    const price = priceCall('gpt-6-luna', makeUsage({ input: 10 }));

    expect(price.credits).toBe('0.002');
  });

  it('refuses a model with no price', () => {
    expect(() => priceCall('gpt-x', makeUsage({ input: 1 }))).toThrow('Model "gpt-x" has no price');
  });
});
