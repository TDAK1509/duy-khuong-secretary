import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMPTY_READER_CATALOG } from '../../../src/app/reading/document-rules.ts';
import { buildReaderPrompt } from '../../../src/app/reading/reader-prompt.ts';

const TODAY = new Date('2026-10-30T18:00:00Z');

describe('buildReaderPrompt member facts', () => {
  it('gives today prompt byte for byte when the sender has no facts', () => {
    const promptToday = readFileSync(new URL('../../fixtures/reader-prompt/pr3-prompt-2026-10-31.txt', import.meta.url), 'utf8');

    const prompt = buildReaderPrompt(TODAY, [], EMPTY_READER_CATALOG, []);

    expect(prompt).toBe(promptToday);
  });
});
