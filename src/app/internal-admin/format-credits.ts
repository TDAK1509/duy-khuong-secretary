const MAX_CREDIT_DECIMALS = 3;

const creditFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: MAX_CREDIT_DECIMALS });

export function formatCredits(credits: string): string {
  return creditFormat.format(Number(credits));
}
