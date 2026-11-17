import { describe, expect, it } from 'vitest';
import { parseSheet } from '../../../src/app/intake/parse-sheet.ts';

describe('parseSheet', () => {
  it('parses a UTF-8 .csv with a comma separator', async () => {
    const bytes = encode('name,plate,date\nA,51A,2026-01-01\nB,51B,2026-01-02\nC,51C,2026-01-03\n');

    const result = await parseSheet('csv', bytes);

    expect(result).toEqual({
      ok: true,
      headers: ['name', 'plate', 'date'],
      rows: [
        ['A', '51A', '2026-01-01'],
        ['B', '51B', '2026-01-02'],
        ['C', '51C', '2026-01-03'],
      ],
    });
  });
});

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
