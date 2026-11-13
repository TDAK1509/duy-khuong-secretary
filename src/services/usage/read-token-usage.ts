import type { TokenUsage } from './token-usage.ts';

export type CompletionUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } | null;
  completion_tokens_details?: { reasoning_tokens?: number } | null;
};

export function readTokenUsage(usage: CompletionUsage | null | undefined): TokenUsage | null {
  if (!usage) return null;
  return {
    input: usage.prompt_tokens,
    cachedInput: usage.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWrite: usage.prompt_tokens_details?.cache_write_tokens ?? 0,
    output: usage.completion_tokens,
    reasoning: usage.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}
