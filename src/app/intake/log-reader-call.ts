import type { TokenUsage } from '../../services/reading/reader-service.ts';

export type ReaderOutcome = 'ok' | 'invalid_output' | 'timeout' | 'unavailable';

export function formatReaderLine(outcome: ReaderOutcome, usage: TokenUsage): string {
  return `[reader] outcome=${outcome} input_tokens=${usage.input} output_tokens=${usage.output} reasoning_tokens=${usage.reasoning}`;
}
