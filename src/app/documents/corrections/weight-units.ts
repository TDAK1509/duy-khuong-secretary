import { toAccentFreeForm } from '../../reading/normalize.ts';

const KG_PER_TON = 1000;

const KILOGRAM_NAMES = ['kilogram', 'kilogam', 'kgs', 'kg'];
const TON_NAMES = ['tons', 'ton', 'tan', 't'];

export const WEIGHT_UNIT_PATTERN = [...TON_NAMES, ...KILOGRAM_NAMES].sort((first, second) => second.length - first.length).join('|');

export function readKilogramsPerUnit(unit: string | null): number | null {
  const name = toAccentFreeForm(unit);
  if (name === null) return null;
  if (KILOGRAM_NAMES.includes(name)) return 1;
  return TON_NAMES.includes(name) ? KG_PER_TON : null;
}

export function formatKilograms(kilograms: number): string {
  const [whole = '', decimals] = kilograms.toFixed(3).replace(/\.?0+$/, '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped}${decimals === undefined ? '' : `,${decimals}`} kg`;
}
