import { describe, expect, it } from 'vitest';
import { matchCodeAnswer } from '../../../src/app/intake/match-code-answer.ts';

const CANDIDATES = ['8936012345678', '8936012845678'];

describe('matchCodeAnswer', () => {
  it('matches a candidate typed with spaces', () => {
    expect(matchCodeAnswer('8936 0128 45678', CANDIDATES)).toBe('8936012845678');
  });

  it('does not take a Vietnamese phrase for a code', () => {
    expect(matchCodeAnswer('cảm ơn', CANDIDATES)).toBeNull();
  });
});
