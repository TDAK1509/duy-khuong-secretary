const WITH_COMMA_DECIMAL = /^(\d+|[1-9]\d{0,2}(?:\.\d{3})+),(\d+)$/;
const WITH_THOUSANDS_DOTS = /^[1-9]\d{0,2}(?:\.\d{3})+$/;
const WITH_ONE_DOT = /^\d+\.\d+$/;

export function parseVietnameseNumber(token: string): number | null {
  const withComma = WITH_COMMA_DECIMAL.exec(token);
  if (withComma !== null) return Number(`${withComma[1]?.replace(/\./g, '')}.${withComma[2]}`);
  if (WITH_THOUSANDS_DOTS.test(token)) return Number(token.replace(/\./g, ''));
  if (WITH_ONE_DOT.test(token) || /^\d+$/.test(token)) return Number(token);
  return null;
}
