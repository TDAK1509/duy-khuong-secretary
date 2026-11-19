export const COLUMN_UNITS = ['vnd', 'kg', 'ton', 'liter', 'rate', 'number'] as const;

export type ColumnUnit = (typeof COLUMN_UNITS)[number];

const ADDITIVE_UNITS: readonly ColumnUnit[] = ['vnd', 'kg', 'ton', 'liter'];

export function isAdditiveUnit(unit: ColumnUnit | null): boolean {
  return unit !== null && ADDITIVE_UNITS.includes(unit);
}

export function readColumnUnit(column: { type: 'number' | 'text' | 'date'; unit?: ColumnUnit | null }): ColumnUnit | null {
  if (column.type !== 'number') return null;
  return column.unit === undefined ? 'number' : column.unit;
}
