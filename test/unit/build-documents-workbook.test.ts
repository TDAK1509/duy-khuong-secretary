import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildDocumentsWorkbook, type ExportRow } from '../../src/app/documents/build-documents-workbook.ts';

const SAMPLE_ROW: ExportRow = {
  document_date: '2026-11-14',
  kind: 'phiếu cân xe',
  title: null,
  document_number: '0001',
  vehicle_plate: '29C12345',
  amount_vnd: null,
  sender_name: 'Hùng',
};

describe('buildDocumentsWorkbook', () => {
  it('produces a sheet named Giấy tờ with the expected header row', async () => {
    const bytes = await buildDocumentsWorkbook([SAMPLE_ROW]);
    const sheet = await readSheet(bytes);

    const headerValues = sheet.getRow(1).values as (string | undefined)[];
    expect(headerValues.slice(1)).toEqual(['Ngày', 'Loại', 'Tiêu đề', 'Số chứng từ', 'Biển số', 'Số tiền (VND)', 'Người gửi']);
  });

  it('formats the date column as dd/MM/yyyy', async () => {
    const bytes = await buildDocumentsWorkbook([{ ...SAMPLE_ROW, document_date: '2026-11-14' }]);
    const sheet = await readSheet(bytes);

    expect(sheet.getRow(2).getCell(1).text).toBe('14/11/2026');
  });

  it('formats the amount with Vietnamese thousands separators', async () => {
    const bytes = await buildDocumentsWorkbook([{ ...SAMPLE_ROW, amount_vnd: 1234567 }]);
    const sheet = await readSheet(bytes);

    expect(sheet.getRow(2).getCell(6).text).toBe('1.234.567');
  });

  it('leaves the amount cell empty when amount_vnd is null', async () => {
    const bytes = await buildDocumentsWorkbook([{ ...SAMPLE_ROW, amount_vnd: null }]);
    const sheet = await readSheet(bytes);

    expect(sheet.getRow(2).getCell(6).text).toBe('');
  });
});

async function readSheet(bytes: Uint8Array): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
  const sheet = workbook.getWorksheet('Giấy tờ');
  if (!sheet) throw new Error('sheet Giấy tờ not found');
  return sheet;
}
