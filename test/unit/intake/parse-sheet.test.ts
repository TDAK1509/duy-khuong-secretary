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

  it('strips a UTF-8 BOM from the first header of a .csv', async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const body = encode('name,plate,date\nA,51A,2026-01-01\n');
    const bytes = new Uint8Array(bom.length + body.length);
    bytes.set(bom, 0);
    bytes.set(body, bom.length);

    const result = await parseSheet('csv', bytes);

    expect(result).toEqual({
      ok: true,
      headers: ['name', 'plate', 'date'],
      rows: [['A', '51A', '2026-01-01']],
    });
  });

  it('keeps a quoted comma inside a .csv cell as one value', async () => {
    const bytes = encode('name,note\n"Smith, Jane","two parts"\n');

    const result = await parseSheet('csv', bytes);

    expect(result).toEqual({
      ok: true,
      headers: ['name', 'note'],
      rows: [['Smith, Jane', 'two parts']],
    });
  });

  it('parses a .csv whose first line uses semicolons', async () => {
    const bytes = encode('name;plate;date\nA;51A;2026-01-01\n');

    const result = await parseSheet('csv', bytes);

    expect(result).toEqual({
      ok: true,
      headers: ['name', 'plate', 'date'],
      rows: [['A', '51A', '2026-01-01']],
    });
  });
});

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
