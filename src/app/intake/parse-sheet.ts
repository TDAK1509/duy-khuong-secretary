import type { SheetExtension } from '../../services/storage/file-storage.ts';
import { parseCsv } from './parse-csv.ts';

export type ParsedSheet = { ok: true; headers: string[]; rows: string[][] } | { ok: false };

export async function parseSheet(extension: SheetExtension, bytes: Uint8Array): Promise<ParsedSheet> {
  if (extension === 'csv') return parseCsv(bytes);
  return { ok: false };
}
