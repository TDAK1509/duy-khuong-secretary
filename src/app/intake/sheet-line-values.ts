import type { ReadingDetail } from '../reading/reading.ts';

const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;
const CLOCK_TIME = /^(\d{1,}):([0-5]\d)$/;
const PARENTHESIZED = /\(([^)]+)\)/;
const MINUTES_UNIT = 'phút';
const KNOWN_UNITS: { pattern: RegExp; unit: string }[] = [
  { pattern: /\bkm\b/iu, unit: 'km' },
  { pattern: /\bkg\b/iu, unit: 'kg' },
  { pattern: /(^|\s|\()tấn($|\s|\))/iu, unit: 'tấn' },
  { pattern: /(^|\s|\()lít($|\s|\))/iu, unit: 'l' },
  { pattern: /\bvnd\b|(^|\s|\()đ($|\s|\))/iu, unit: 'vnd' },
  { pattern: /(^|\s|\()phút($|\s|\))/iu, unit: MINUTES_UNIT },
  { pattern: /(^|\s|\()giờ($|\s|\))/iu, unit: 'giờ' },
];

export function buildSheetLine(header: string, cell: string): ReadingDetail {
  const value = cell.trim();
  const base = { label: header, value, meaning: header, item: null, date_time: null, number: null, unit: null };
  const clock = CLOCK_TIME.exec(value);
  if (clock !== null) return { ...base, line_number: Number(clock[1]) * 60 + Number(clock[2]), line_unit: MINUTES_UNIT };
  const unit = findHeaderUnit(header);
  if (PLAIN_DECIMAL.test(value) && unit !== null) return { ...base, line_number: Number(value), line_unit: unit };
  return { ...base, line_number: null, line_unit: null };
}

function findHeaderUnit(header: string): string | null {
  const normalized = header.normalize('NFC');
  const known = KNOWN_UNITS.find(({ pattern }) => pattern.test(normalized));
  if (known !== undefined) return known.unit;
  const inParentheses = PARENTHESIZED.exec(normalized)?.[1]?.trim().toLowerCase() ?? '';
  return inParentheses === '' ? null : inParentheses;
}
