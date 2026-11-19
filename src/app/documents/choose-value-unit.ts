import type { ColumnUnit } from './format-workbook-sheet.ts';

export type UnitSample = { number: string | null; unit: string | null; text: string | null };

const MONEY_UNIT = 'đ';
const WEIGHT_UNIT = 'kg';

export function chooseValueUnit(samples: UnitSample[]): ColumnUnit | null {
  const present = samples.filter((sample) => sample.number !== null || sample.text !== null);
  if (present.length === 0 || present.some((sample) => sample.number === null || sample.unit === null)) return null;
  const units = new Set(present.map((sample) => sample.unit));
  if (units.size !== 1) return isEveryRate(units) ? 'rate' : null;
  const [unit] = units;
  if (unit === MONEY_UNIT) return 'vnd';
  if (unit === WEIGHT_UNIT) return 'kg';
  return unit?.includes('/') ? 'rate' : null;
}

function isEveryRate(units: Set<string | null>): boolean {
  return [...units].every((unit) => unit !== null && unit.includes('/'));
}
