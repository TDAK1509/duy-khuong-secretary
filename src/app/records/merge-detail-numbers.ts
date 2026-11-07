import { z } from 'zod';
import type { StoredDetail } from '../reading/detail-numbers-request.ts';
import { readNumberPair } from '../reading/reading.ts';

const detailNumbersReplySchema = z.strictObject({
  details: z.array(z.strictObject({ index: z.number().int(), number: z.number().nullable(), unit: z.string().nullable() })),
});

export function mergeDetailNumbers(details: StoredDetail[], reply: unknown): StoredDetail[] {
  const replied = detailNumbersReplySchema.parse(reply).details;
  return details.map((detail, index) => ({ ...detail, ...readNumberPair(replied[index]?.number, replied[index]?.unit) }));
}
