import { describe, expect, it } from 'vitest';
import { splitText } from '../../src/app/delivery/split-text.ts';

const LIMIT = 2000;

describe('splitText', () => {
  it('keeps a text of exactly the limit as one part', () => {
    const text = 'a'.repeat(2000);

    expect(splitText(text, LIMIT)).toEqual([text]);
  });
});
