import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDocumentsWorkbook, type ExportRow } from '../../src/app/documents/build-documents-workbook.ts';
import { loadWorkbook } from './support/read-marked-sheet.ts';

const EXPORT_ID = 'aaaaaaaa-0040-4000-8000-000000000001';
const ROW_IDS = ['aaaaaaaa-0041-4000-8000-000000000001', 'aaaaaaaa-0041-4000-8000-000000000002'];

test('the workbook holds the hidden row id column', async () => {
  const workbook = await loadWorkbook(await buildTwoRowWorkbook());
  const sheet = workbook.worksheets[0]!;
  const idColumn = sheet.columnCount;
  assert.equal(sheet.getColumn(idColumn).hidden, true);
  assert.deepEqual([4, 5, 6].map((rowNumber) => sheet.getRow(rowNumber).getCell(idColumn).value), ['_row_id', ...ROW_IDS]);
});

test('the workbook holds a very hidden sheet that names the export', async () => {
  const workbook = await loadWorkbook(await buildTwoRowWorkbook());
  const markSheet = workbook.getWorksheet('_tro_ly');
  assert.equal(markSheet?.state, 'veryHidden');
  assert.deepEqual([1, 2].map((rowNumber) => [1, 2, 3].map((column) => markSheet?.getRow(rowNumber).getCell(column).value)), [['format', 'export_id', 'sheet'], [1, EXPORT_ID, 'Giấy tờ']]);
});

function buildTwoRowWorkbook(): Promise<Uint8Array> {
  return buildDocumentsWorkbook({ title: 'Giấy tờ', createdAt: new Date('2026-03-10T03:00:00Z'), rows: ROW_IDS.map(buildExportRow), marks: { exportId: EXPORT_ID, rowIds: ROW_IDS } });
}

function buildExportRow(id: string): ExportRow {
  return { id, document_date: '2026-03-05', kind: 'weigh-ticket', title: null, document_number: null, vehicle_plate: '51C12345', amount_vnd: null, sender_name: null, company_knowledge: [] };
}
