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

  it('cuts a long text without line breaks at the last space', () => {
    const text = `${'a'.repeat(1950)} ${'b'.repeat(549)}`;

    const parts = splitText(text, LIMIT);

    expect(parts).toEqual(['a'.repeat(1950), 'b'.repeat(549)]);
  });

  it('cuts a long text without spaces at the limit', () => {
    const text = 'a'.repeat(2500);

    const parts = splitText(text, LIMIT);

    expect(parts).toEqual(['a'.repeat(2000), 'a'.repeat(500)]);
  });

  it('never cuts a character made of two UTF-16 units in half', () => {
    const text = `${'a'.repeat(1999)}😀${'b'.repeat(500)}`;

    const parts = splitText(text, LIMIT);

    expect(parts).toEqual([`${'a'.repeat(1999)}😀`, 'b'.repeat(500)]);
  });
});
