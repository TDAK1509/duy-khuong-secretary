import type { ReaderResult } from '../../services/reading/reader-service.ts';
import type { TokenUsage } from '../../services/usage/token-usage.ts';

export type ReaderOutcome = 'ok' | 'invalid_output' | 'timeout' | 'unavailable';

export function logReaderCall(outcome: ReaderOutcome, result: ReaderResult): void {
  const usage = 'usage' in result ? result.usage : null;
  console.log(formatReaderLine(outcome, usage));
}

export function formatReaderLine(outcome: ReaderOutcome, usage: TokenUsage | null): string {
  const input = usage?.input ?? 'unknown';
  const output = usage?.output ?? 'unknown';
  const reasoning = usage?.reasoning ?? 'unknown';
  return `[reader] outcome=${outcome} input_tokens=${input} output_tokens=${output} reasoning_tokens=${reasoning}`;
}
