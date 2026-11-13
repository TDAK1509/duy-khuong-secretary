const MAX_CREDIT_DECIMALS = 3;
const USD_DECIMALS = 4;

const creditFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: MAX_CREDIT_DECIMALS });
const wholeCreditFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export type Usage = { credits: string; costUsd: string };

export function formatCredits(credits: string): string {
  return creditFormat.format(Number(credits));
}

export function formatUsage({ credits, costUsd }: Usage): string {
  return `${wholeCreditFormat.format(Number(credits))} credit / $${Number(costUsd).toFixed(USD_DECIMALS)}`;
}
