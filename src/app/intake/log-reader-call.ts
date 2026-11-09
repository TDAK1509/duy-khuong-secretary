import type { ReaderResult, TokenUsage } from '../../services/reading/reader-service.ts';

export type ReaderOutcome = 'ok' | 'invalid_output' | 'timeout' | 'unavailable';

const UNKNOWN_USAGE: TokenUsage = { input: 'unknown', output: 'unknown', reasoning: 'unknown' };

export function logReaderCall(outcome: ReaderOutcome, result: ReaderResult): void {
  const usage = 'usage' in result && result.usage ? result.usage : UNKNOWN_USAGE;
  console.log(formatReaderLine(outcome, usage));
}

export function formatReaderLine(outcome: ReaderOutcome, usage: TokenUsage): string {
  return `[reader] outcome=${outcome} input_tokens=${usage.input} output_tokens=${usage.output} reasoning_tokens=${usage.reasoning}`;
}
