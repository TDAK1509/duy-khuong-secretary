import { normalizeCode } from '../reading/normalize.ts';

export function matchCodeAnswer(text: string, candidates: string[]): string | null {
  const answered = normalizeCode(text);
  return candidates.find((candidate) => normalizeCode(candidate) === answered) ?? null;
}
