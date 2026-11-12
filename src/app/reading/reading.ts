import { z } from 'zod';

export const STANDARD_UNITS = ['kg', 'l', 'km', 'vnd'] as const;

type StandardUnit = (typeof STANDARD_UNITS)[number];

const detailSchema = z
  .strictObject({
    label: z.string(),
    value: z.string(),
    number: z.unknown().optional(),
    unit: z.unknown().optional(),
    meaning: z.string().nullable(),
    item: z.string().nullable(),
    date_time: z.string().nullable(),
  })
  .transform(({ number, unit, ...detail }) => ({ ...detail, ...readNumberPair(number, unit), ...readLinePair(number, unit) }));

export type NumberPair = { number: number; unit: StandardUnit } | { number: null; unit: null };

export function readNumberPair(number: unknown, unit: unknown): NumberPair {
  if (isNonNegativeNumber(number) && isStandardUnit(unit)) return { number, unit };
  return { number: null, unit: null };
}

export type LinePair = { line_number: number; line_unit: string } | { line_number: null; line_unit: null };

export function readLinePair(number: unknown, unit: unknown): LinePair {
  if (isNonNegativeNumber(number) && typeof unit === 'string' && unit.trim() !== '') return { line_number: number, line_unit: unit.trim() };
  return { line_number: null, line_unit: null };
}

function isNonNegativeNumber(number: unknown): number is number {
  return typeof number === 'number' && Number.isFinite(number) && number >= 0;
}

function isStandardUnit(unit: unknown): unit is StandardUnit {
  return STANDARD_UNITS.some((standardUnit) => standardUnit === unit);
}

const partySchema = z.strictObject({
  role: z.string(),
  type: z.string(),
  printed_name: z.string(),
  known_name: z.string().nullable(),
});

const itemSchema = z.strictObject({
  category: z.string(),
  document_title: z.string().nullable(),
  maintenance_item: z.string().nullable(),
  occurred_on: z.iso.date().nullable(),
  amount_vnd: z.number().int().min(0).nullable(),
  identifiers: z.array(z.string()),
  vehicle_plate: z.string().nullable(),
  document_number: z.string().nullable(),
  document_kind: z.string(),
  stage: z.enum(['dispatch', 'receipt']).nullable(),
  parties: z.array(partySchema),
  details: z.array(detailSchema),
});

const readingSchema = z.strictObject({
  has_work_data: z.boolean(),
  needs_explanation: z.boolean(),
  has_question: z.boolean(),
  photo_problem: z.enum(['blurry', 'cut_off', 'not_work']).nullable().default(null),
  items: z.array(itemSchema),
});

export type ReadingItem = z.infer<typeof itemSchema>;
export type Reading = z.infer<typeof readingSchema>;
export type ReadingDetail = ReadingItem['details'][number];
export type ReadingParty = ReadingItem['parties'][number];

export type ReadAttempt =
  | { ok: true; reading: Reading }
  | { ok: false; reason: 'timeout' | 'invalid_output' | 'unavailable' };

export function validateReading(json: unknown): ReadAttempt {
  const parsed = readingSchema.safeParse(json);
  return parsed.success ? { ok: true, reading: parsed.data } : { ok: false, reason: 'invalid_output' };
}
