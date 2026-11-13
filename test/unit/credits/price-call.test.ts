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
});
