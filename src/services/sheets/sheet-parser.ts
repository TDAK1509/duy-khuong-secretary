export type SheetRow = { rowNumber: number; cells: string[] };

export type XlsxRows = { ok: true; rows: SheetRow[] } | { ok: false };

export interface SheetParser {
  parseXlsx(bytes: Uint8Array): Promise<XlsxRows>;
}
