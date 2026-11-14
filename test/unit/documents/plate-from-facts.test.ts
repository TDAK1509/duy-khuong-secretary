import { describe, expect, it } from 'vitest';
import { extractPlateFromFacts } from '../../../src/app/documents/plate-from-facts.ts';

describe('extractPlateFromFacts', () => {
  it('extracts the plate from a fact with a plate-shaped substring', () => {
    const plate = extractPlateFromFacts(['Biển số xe: 93C-123.46']);

    expect(plate).toBe('93C-123.46');
  });

  it('returns null when no fact contains a plate-shaped substring', () => {
    const plate = extractPlateFromFacts(['Hay giao hàng cho công ty A']);

    expect(plate).toBeNull();
  });

  it('returns the newest matching fact plate when multiple facts hold plates', () => {
    const plate = extractPlateFromFacts(['Biển số xe: 93C-123.40', 'Biển số xe: 93C-123.46']);

    expect(plate).toBe('93C-123.46');
  });
});
