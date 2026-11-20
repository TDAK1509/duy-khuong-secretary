const MAX_ERROR_LENGTH = 160;
const API_KEY = /sk-[A-Za-z0-9*_-]+/g;
const QUOTED_VALUE = /"[^"]*"|'[^']*'/g;
const LONG_NUMBER = /\d{6,}/g;

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const message = error.message.replace(API_KEY, 'sk-[redacted]').replace(QUOTED_VALUE, '"…"').replace(LONG_NUMBER, '#');
  const code = 'code' in error && typeof error.code === 'string' ? ` [${error.code}]` : '';
  return `${error.name}${code}: ${message}`.slice(0, MAX_ERROR_LENGTH);
}
