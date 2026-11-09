import { describe, expect, it } from 'vitest';
import { formatReaderLine } from '../../../src/app/intake/log-reader-call.ts';

describe('formatReaderLine', () => {
  it('holds the outcome and the token counts but never the message text', () => {
    const messageText = 'XE 29C-999.99';

    const line = formatReaderLine('ok', { input: 100, output: 'unknown', reasoning: 'unknown' });

    expect(line).toBe('[reader] outcome=ok input_tokens=100 output_tokens=unknown reasoning_tokens=unknown');
    expect(line).not.toContain(messageText);
  });
});
