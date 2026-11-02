import { z } from 'zod';

const itemSchema = z.object({
  category: z.enum(['fuel', 'toll', 'delivery_pickup', 'delivery_dropoff', 'maintenance', 'certificate', 'other']),
  maintenance_item: z.string().nullable(),
  occurred_on: z.iso.date().nullable(),
  amount_vnd: z.number().int().min(0).nullable(),
  identifiers: z.array(z.string()),
  vehicle_plate: z.string().nullable(),
  document_number: z.string().nullable(),
  details: z.array(z.object({ label: z.string(), value: z.string() })),
});

const readingSchema = z.object({
  has_work_data: z.boolean(),
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
