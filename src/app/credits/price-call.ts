import type { TokenUsage } from '../../services/usage/token-usage.ts';

const MARKUP_PERCENT = 150;
const NANO_USD_PER_MILLI_CREDIT = 1000;

type NanoUsdPerToken = { input: number; output: number };

const PRICES: Record<string, NanoUsdPerToken> = {
  'gpt-6.1-sol': { input: 2000, output: 10000 },
};

export type PricedCall = { costUsd: string; credits: string };

export function priceCall(model: string, usage: TokenUsage): PricedCall {
  const rates = PRICES[model];
  if (rates === undefined) throw new Error(`Model "${model}" has no price`);
  const costNanoUsd = usage.input * rates.input + usage.output * rates.output;
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
