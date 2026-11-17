import type { TokenUsage } from './token-usage.ts';

export type ResponseUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number } | null;
  output_tokens_details?: { reasoning_tokens?: number } | null;
};

export function readResponseUsage(usage: ResponseUsage | null | undefined): TokenUsage | null {
  if (!usage) return null;
  return {
    input: usage.input_tokens ?? 0,
    cachedInput: usage.input_tokens_details?.cached_tokens ?? 0,
    cacheWrite: 0,
    output: usage.output_tokens ?? 0,
    reasoning: usage.output_tokens_details?.reasoning_tokens ?? 0,
  };
}
