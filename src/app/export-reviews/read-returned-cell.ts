import type ExcelJS from 'exceljs';
import type { CellValue, ValueType } from '../documents/recorded-export.ts';

export function readReturnedCell(raw: ExcelJS.CellValue, valueType: ValueType): CellValue {
  const value = unwrapCellValue(raw);
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value === 'string') return readTextCell(value.trim(), valueType);
  if (value instanceof Date) return valueType === 'text' ? value.toISOString().slice(0, 10) : value.toISOString().slice(0, valueType === 'date' ? 10 : 19);
  if (valueType === 'text') return String(value);
  return value;
}

function unwrapCellValue(raw: ExcelJS.CellValue): string | number | boolean | Date | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || raw instanceof Date) return raw;
  if ('result' in raw) return unwrapCellValue(raw.result as ExcelJS.CellValue);
  if ('richText' in raw) return raw.richText.map((part) => part.text).join('');
  if ('text' in raw) return unwrapCellValue(raw.text as ExcelJS.CellValue);
  return null;
}

function readTextCell(text: string, valueType: ValueType): string | number {
  const number = Number(text);
  return valueType === 'number' && Number.isFinite(number) ? number : text;
}
