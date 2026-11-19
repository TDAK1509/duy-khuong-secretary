import type { ReadingDetail } from '../reading/reading.ts';

const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;
const DOTTED_THOUSANDS = /^\d{1,3}(\.\d{3})+$/;
const CLOCK_TIME = /^(\d{1,}):([0-5]\d)$/;
const PARENTHESIZED = /\(([^)]+)\)/;
const UNIT_TAG = /^\p{L}{1,10}$/u;
const NOT_UNITS = ['gps', 'tb', 'cơ', 'lx'];
const TIME_OF_DAY_HEADER = /^giờ\s+(đi|đến|về|xuất|nhập|bắt đầu|kết thúc|vào|ra)\b/iu;
const MINUTES = 'phút';
const HOURS = 'giờ';
const KNOWN_UNITS: { pattern: RegExp; unit: string }[] = [
  { pattern: /\bkm\s*\/\s*h\b/iu, unit: 'km/h' },
  { pattern: /\bkm\b/iu, unit: 'km' },
  { pattern: /\bkg\b/iu, unit: 'kg' },
  { pattern: /(^|[\s(])tấn($|[\s)])/iu, unit: 'tấn' },
  { pattern: /(^|[\s(])lít($|[\s)])/iu, unit: 'l' },
  { pattern: /\bvnd\b|(^|[\s(])(vnđ|đồng|đ)($|[\s)])/iu, unit: 'vnd' },
  { pattern: /(^|[\s(])phút($|[\s)])/iu, unit: MINUTES },
  { pattern: /(^|[\s(])giờ($|[\s)])/iu, unit: HOURS },
];

export function buildSheetLine(header: string, cell: string): ReadingDetail {
  const value = cell.trim();
  const base = { label: header, value, meaning: header, item: null, date_time: null, number: null, unit: null };
  const amount = readAmount(header.normalize('NFC'), value);
  return amount === null ? { ...base, line_number: null, line_unit: null } : { ...base, line_number: amount.number, line_unit: amount.unit };
}

type Amount = { number: number; unit: string };

function readAmount(header: string, value: string): Amount | null {
  if (TIME_OF_DAY_HEADER.test(header)) return null;
  const unit = findHeaderUnit(header);
  const clock = CLOCK_TIME.exec(value);
  if (clock !== null) return readClockAmount(Number(clock[1]) * 60 + Number(clock[2]), unit);
  if (unit === null) return null;
  if (unit === 'vnd' && DOTTED_THOUSANDS.test(value)) return { number: Number(value.replaceAll('.', '')), unit };
  if (PLAIN_DECIMAL.test(value)) return { number: Number(value), unit };
  return null;
}

function readClockAmount(minutes: number, unit: string | null): Amount {
  return unit === HOURS ? { number: Math.round((minutes / 60) * 100) / 100, unit: HOURS } : { number: minutes, unit: MINUTES };
}

function findHeaderUnit(header: string): string | null {
  const known = KNOWN_UNITS.find(({ pattern }) => pattern.test(header));
  if (known !== undefined) return known.unit;
  const tag = PARENTHESIZED.exec(header)?.[1]?.trim().toLowerCase() ?? '';
  return UNIT_TAG.test(tag) && !NOT_UNITS.includes(tag) ? tag : null;
}
