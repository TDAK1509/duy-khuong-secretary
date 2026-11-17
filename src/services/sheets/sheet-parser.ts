export type XlsxRows = { ok: true; rows: string[][] } | { ok: false };

export interface SheetParser {
  parseXlsx(bytes: Uint8Array): Promise<XlsxRows>;
}
