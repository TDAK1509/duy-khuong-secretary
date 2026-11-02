const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isRealIsoDate(text: string): boolean {
  const match = ISO_DATE.exec(text);
  if (match === null) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
