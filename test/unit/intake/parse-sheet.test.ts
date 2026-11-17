import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseSheet } from '../../../src/app/intake/parse-sheet.ts';
import { ExcelJsSheetParser } from '../../../src/providers/sheets/exceljs-sheet-parser.ts';
import type { SheetParser } from '../../../src/services/sheets/sheet-parser.ts';

const sheetParser: SheetParser = new ExcelJsSheetParser();

describe('parseSheet', () => {
  it('parses a UTF-8 .csv with a comma separator', async () => {
    const bytes = encode('name,plate,date\nA,51A,2026-01-01\nB,51B,2026-01-02\nC,51C,2026-01-03\n');

    const result = await parseSheet('csv', bytes, sheetParser);

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

    const result = await parseSheet('csv', bytes, sheetParser);

    expect(result).toEqual({
      ok: true,
      headers: ['name', 'plate', 'date'],
      rows: [['A', '51A', '2026-01-01']],
    });
  });

  it('keeps a quoted comma inside a .csv cell as one value', async () => {
    const bytes = encode('name,note\n"Smith, Jane","two parts"\n');

    const result = await parseSheet('csv', bytes, sheetParser);

    expect(result).toEqual({
      ok: true,
      headers: ['name', 'note'],
      rows: [['Smith, Jane', 'two parts']],
    });
  });

  it('parses a .csv whose first line uses semicolons', async () => {
    const bytes = encode('name;plate;date\nA;51A;2026-01-01\n');

    const result = await parseSheet('csv', bytes, sheetParser);

    expect(result).toEqual({
      ok: true,
      headers: ['name', 'plate', 'date'],
      rows: [['A', '51A', '2026-01-01']],
    });
  });

  it('returns a parse failure when .xlsx bytes are not a ZIP', async () => {
    const bytes = new Uint8Array([0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a]);

    const result = await parseSheet('xlsx', bytes, sheetParser);

    expect(result).toEqual({ ok: false });
  });

  it('returns zero headers and zero rows for an empty .csv', async () => {
    const result = await parseSheet('csv', new Uint8Array(), sheetParser);

    expect(result).toEqual({ ok: true, headers: [], rows: [] });
  });

  it('drops an empty trailing row from a .xlsx first sheet', async () => {
    const bytes = await buildXlsx([
      ['name', 'plate', 'date'],
      ['A', '51A', '2026-01-01'],
      ['', '', ''],
    ]);

    const result = await parseSheet('xlsx', bytes, sheetParser);

    expect(result).toEqual({
      ok: true,
      headers: ['name', 'plate', 'date'],
      rows: [['A', '51A', '2026-01-01']],
    });
  });

  it('parses a .xlsx first sheet with one header and two rows', async () => {
    const bytes = await buildXlsx([
      ['name', 'plate', 'date'],
      ['A', '51A', '2026-01-01'],
      ['B', '51B', '2026-01-02'],
    ]);

    const result = await parseSheet('xlsx', bytes, sheetParser);

    expect(result).toEqual({
      ok: true,
      headers: ['name', 'plate', 'date'],
      rows: [
        ['A', '51A', '2026-01-01'],
        ['B', '51B', '2026-01-02'],
      ],
    });
  });
});

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function buildXlsx(cells: string[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('sheet1');
  for (const row of cells) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
