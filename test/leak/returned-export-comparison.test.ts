import assert from 'node:assert/strict';
import { test } from 'node:test';
import type ExcelJS from 'exceljs';
import type { CellValue, RecordedCell, ValueType } from '../../src/app/documents/recorded-export.ts';
import { listChangedCells, type CellChange } from '../../src/app/export-reviews/list-changed-cells.ts';
import { readReturnedCell } from '../../src/app/export-reviews/read-returned-cell.ts';

test('an unchanged number reads as unchanged', () => {
  assert.deepEqual(compare('number', 27080, 27080), []);
});

test('an unchanged date reads as unchanged', () => {
  assert.deepEqual(compare('date', '2026-11-03', new Date(Date.UTC(2026, 10, 3))), []);
});

test('a text that looks like a number stays text', () => {
  assert.deepEqual(compare('text', '0012', '0012'), []);
});

test('a blank cell that now has a number is a change', () => {
  assert.deepEqual(compare('number', null, 100000), [{ columnKey: 'cell', valueType: 'number', before: null, after: 100000 }]);
});

test('an edited number is a change', () => {
  assert.deepEqual(compare('number', 27080, 27800), [{ columnKey: 'cell', valueType: 'number', before: 27080, after: 27800 }]);
});

function compare(valueType: ValueType, saved: CellValue, returned: ExcelJS.CellValue): CellChange[] {
  const column = { key: 'cell', name: 'Cell', value_type: valueType };
  const cell: RecordedCell = { value_type: valueType, value: saved, source: null };
  return listChangedCells([column], { cell }, { cell: readReturnedCell(returned, valueType) });
}
