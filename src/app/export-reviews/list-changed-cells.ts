import type { CellValue, RecordedCell, RecordedColumn, ValueType } from '../documents/recorded-export.ts';

export type CellChange = { columnKey: string; valueType: ValueType; before: CellValue; after: CellValue };

export function listChangedCells(columns: RecordedColumn[], saved: Record<string, RecordedCell>, returned: Record<string, CellValue>): CellChange[] {
  return columns.flatMap((column) => {
    const cell = saved[column.key];
    if (cell === undefined || cell.source?.kind === 'server') return [];
    const before = normalizeSavedValue(cell);
    const after = returned[column.key] ?? null;
    return before === after ? [] : [{ columnKey: column.key, valueType: column.value_type, before, after }];
  });
}

function normalizeSavedValue({ value, value_type: valueType }: RecordedCell): CellValue {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (text === '') return null;
  return valueType === 'date' ? text.slice(0, 10) : text;
}
