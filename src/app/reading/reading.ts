import { z } from 'zod';

export const itemSchema = z.strictObject({
  category: z.string(),
  document_title: z.string().nullable(),
  maintenance_item: z.string().nullable(),
  occurred_on: z.iso.date().nullable(),
  amount_vnd: z.number().int().min(0).nullable(),
  identifiers: z.array(z.string()),
  vehicle_plate: z.string().nullable(),
  document_number: z.string().nullable(),
  details: z.array(z.strictObject({ label: z.string(), value: z.string() })),
});

const readingSchema = z.strictObject({
  has_work_data: z.boolean(),
  needs_explanation: z.boolean(),
  has_question: z.boolean(),
  items: z.array(itemSchema),
});

export type ReadingItem = z.infer<typeof itemSchema>;
export type Reading = z.infer<typeof readingSchema>;

export type ReadAttempt =
  | { ok: true; reading: Reading }
  | { ok: false; reason: 'timeout' | 'invalid_output' | 'unavailable' };

export function validateReading(json: unknown): ReadAttempt {
  const parsed = readingSchema.safeParse(json);
  return parsed.success ? { ok: true, reading: parsed.data } : { ok: false, reason: 'invalid_output' };
}
