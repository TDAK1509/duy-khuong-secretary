import { describe, expect, it } from 'vitest';
import { splitText } from '../../src/app/delivery/split-text.ts';

const LIMIT = 2000;

describe('splitText', () => {
  it('keeps a text of exactly the limit as one part', () => {
    const text = 'a'.repeat(2000);

    expect(splitText(text, LIMIT)).toEqual([text]);
  });

  it('cuts a long text at the last line break before the limit', () => {
    const text = `${'a'.repeat(1800)}\n${'b'.repeat(699)}`;

    const parts = splitText(text, LIMIT);

    expect(parts).toEqual(['a'.repeat(1800), 'b'.repeat(699)]);
  });
});
