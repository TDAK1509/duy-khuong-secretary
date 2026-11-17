import type { SheetParser } from '../../services/sheets/sheet-parser.ts';
import type { SheetExtension } from '../../services/storage/file-storage.ts';
import { parseCsv } from './parse-csv.ts';

export type ParsedSheet = { ok: true; headers: string[]; rows: string[][] } | { ok: false };

export async function parseSheet(
  extension: SheetExtension,
  bytes: Uint8Array,
  sheetParser: SheetParser,
): Promise<ParsedSheet> {
  if (extension === 'csv') return parseCsv(bytes);
  return splitHeaderAndRows(await sheetParser.parseXlsx(bytes));
}

function splitHeaderAndRows(result: Awaited<ReturnType<SheetParser['parseXlsx']>>): ParsedSheet {
  if (!result.ok) return { ok: false };
  const [headers, ...dataRows] = result.rows.filter((row) => row.some((cell) => cell !== ''));
  if (!headers) return { ok: true, headers: [], rows: [] };
  return { ok: true, headers, rows: dataRows };
}
