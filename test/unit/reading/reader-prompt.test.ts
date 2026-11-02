import { describe, expect, it } from 'vitest';
import { buildReaderPrompt } from '../../../src/app/reading/reader-prompt.ts';

describe('buildReaderPrompt', () => {
  it("ends with today's Vietnam date", () => {
    const lateEveningUtc = new Date('2026-10-30T18:00:00Z');

    const prompt = buildReaderPrompt(lateEveningUtc);

    expect(prompt.endsWith('- Hôm nay là 31/10/2026 (giờ Việt Nam).')).toBe(true);
  });
});
