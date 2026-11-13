import type { TokenUsage } from '../../src/services/usage/token-usage.ts';

export const PHOTO_READ_USAGE: TokenUsage = { input: 5700, cachedInput: 0, cacheWrite: 0, output: 1500, reasoning: 0 };

export const TEXT_READ_USAGE: TokenUsage = { input: 4300, cachedInput: 0, cacheWrite: 0, output: 50, reasoning: 0 };

export const CHAT_ROUND_USAGE: TokenUsage = { input: 10000, cachedInput: 0, cacheWrite: 0, output: 200, reasoning: 0 };
