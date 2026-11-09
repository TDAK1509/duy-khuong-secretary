const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/;

export function parseDateTime(text: string | null): string | null {
  const match = DATE_TIME_PATTERN.exec(text?.trim() ?? '');
  if (!match) return null;
  const [year, month, day, hour = 0, minute = 0, second = 0] = match.slice(1).map((part) => (part === undefined ? undefined : Number(part)));
  if (!isRealMoment(year, month, day, hour, minute, second)) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4] ?? '00'}:${match[5] ?? '00'}:${match[6] ?? '00'}`;
}

function isRealMoment(year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0): boolean {
  const moment = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    moment.getUTCFullYear() === year &&
    moment.getUTCMonth() === month - 1 &&
    moment.getUTCDate() === day &&
    moment.getUTCHours() === hour &&
    moment.getUTCMinutes() === minute &&
    moment.getUTCSeconds() === second
  );
}
