import { describe, expect, it } from 'vitest';
import { parseDateTime } from '../../../src/app/documents/parse-date-time.ts';

describe('parseDateTime', () => {
  it('keeps a date and time as printed', () => {
    expect(parseDateTime('2026-11-05T13:03:55')).toBe('2026-11-05T13:03:55');
  });

  it('puts a date alone at midnight', () => {
    expect(parseDateTime('2026-11-05')).toBe('2026-11-05T00:00:00');
  });

  it('gives null for a date that does not exist', () => {
    expect(parseDateTime('2026-02-30')).toBeNull();
  });

  it('gives null for an hour that does not exist', () => {
    expect(parseDateTime('2026-11-05T25:00:00')).toBeNull();
  });

  it('gives null for text that is not a date', () => {
    expect(parseDateTime('05/11/2026')).toBeNull();
    expect(parseDateTime(null)).toBeNull();
  });
});
