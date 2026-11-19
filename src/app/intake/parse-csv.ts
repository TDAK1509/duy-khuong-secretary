import type { SheetRow } from '../../services/sheets/sheet-parser.ts';

export function parseCsv(bytes: Uint8Array): SheetRow[] {
  const text = decodeUtf8(bytes);
  if (text.length === 0) return [];
  const rows = tokenize(text, pickSeparator(text)).map((cells, index) => ({ rowNumber: index + 1, cells: cells.map((cell) => cell.trim()) }));
  return rows.filter((row) => hasAnyNonEmptyCell(row.cells));
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function pickSeparator(text: string): ',' | ';' {
  const firstLineEnd = text.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  return firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
}

function tokenize(text: string, separator: ',' | ';'): string[][] { // allow-long-function: a single-state CSV tokenizer reads cleanest in one pass // allow-comment: escape hatch markers
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; continue; }
      if (char === '"') { quoted = false; continue; }
      cell += char;
      continue;
    }
    if (char === '"' && cell === '') { quoted = true; continue; }
    if (char === separator) { row.push(cell); cell = ''; continue; }
    if (char === '\r') continue;
    if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += char;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

function hasAnyNonEmptyCell(row: string[]): boolean {
  return row.some((cell) => cell !== '');
}
