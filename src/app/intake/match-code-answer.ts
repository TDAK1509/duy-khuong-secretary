import { normalizeCode } from '../reading/normalize.ts';

const LOOKS_LIKE_A_CODE = /^(?=.*\d)[A-Z0-9]{4,40}$/;

export function matchCodeAnswer(text: string, candidates: string[]): string | null {
  const answered = normalizeCode(text);
  const shown = candidates.find((candidate) => normalizeCode(candidate) === answered);
  if (shown !== undefined) return shown;
  return isOneLine(text) && answered !== null && LOOKS_LIKE_A_CODE.test(answered) ? text.trim() : null;
}

function isOneLine(text: string): boolean {
  return !text.trim().includes('\n');
}
