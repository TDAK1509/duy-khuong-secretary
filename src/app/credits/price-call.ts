import type { TokenUsage } from '../../services/usage/token-usage.ts';

const MARKUP_PERCENT = 150;
const NANO_USD_PER_MILLI_CREDIT = 1000;

type NanoUsdPerToken = { input: number; cachedInput: number; cacheWrite: number; output: number };

const PRICES = new Map<string, NanoUsdPerToken>([
  ['gpt-6.1-sol', { input: 2000, cachedInput: 100, cacheWrite: 2500, output: 10000 }],
  ['gpt-6-luna', { input: 100, cachedInput: 10, cacheWrite: 125, output: 500 }],
]);

export type PricedCall = { costUsd: string; credits: string };

export function hasPrice(model: string): boolean {
  return PRICES.has(model);
}

export function priceCall(model: string, usage: TokenUsage): PricedCall {
  const rates = PRICES.get(model);
  if (rates === undefined) throw new Error(`Model "${model}" has no price`);
  const ordinaryInput = usage.input - usage.cachedInput - usage.cacheWrite;
  const costNanoUsd =
    ordinaryInput * rates.input +
    usage.cachedInput * rates.cachedInput +
    usage.cacheWrite * rates.cacheWrite +
    usage.output * rates.output;
  return { costUsd: formatNanoUsd(costNanoUsd), credits: formatMilliCredits(toMilliCredits(costNanoUsd)) };
}

function toMilliCredits(costNanoUsd: number): number {
  const scaledByMarkup = costNanoUsd * MARKUP_PERCENT;
  const divisor = 100 * NANO_USD_PER_MILLI_CREDIT;
  return Math.floor((scaledByMarkup + divisor / 2) / divisor);
}

function formatNanoUsd(nanoUsd: number): string {
  return formatWithDecimals(nanoUsd, 9);
}

function formatMilliCredits(milliCredits: number): string {
  return formatWithDecimals(milliCredits, 3);
}

function formatWithDecimals(scaledInteger: number, decimals: number): string {
  const scale = 10 ** decimals;
  return `${Math.floor(scaledInteger / scale)}.${String(scaledInteger % scale).padStart(decimals, '0')}`;
}
