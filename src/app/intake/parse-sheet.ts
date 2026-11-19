import type { SheetParser, SheetRow } from '../../services/sheets/sheet-parser.ts';
import type { SheetExtension } from '../../services/storage/file-storage.ts';
import { parseCsv } from './parse-csv.ts';
import { splitSheetHeader } from './split-sheet-header.ts';

export type ParsedSheet = { ok: true; headers: string[]; headerRowNumber: number; contextLines: string[]; rows: SheetRow[] } | { ok: false };

const NO_ROWS: ParsedSheet = { ok: true, headers: [], headerRowNumber: 1, contextLines: [], rows: [] };

export async function parseSheet(extension: SheetExtension, bytes: Uint8Array, sheetParser: SheetParser): Promise<ParsedSheet> {
  if (extension === 'csv') return splitRows(parseCsv(bytes));
  const result = await sheetParser.parseXlsx(bytes);
  return result.ok ? splitRows(result.rows) : { ok: false };
}

function splitRows(rows: SheetRow[]): ParsedSheet {
  const split = splitSheetHeader(rows);
  return split === null ? NO_ROWS : { ok: true, ...split };
}
