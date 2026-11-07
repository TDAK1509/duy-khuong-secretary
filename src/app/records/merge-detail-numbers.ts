import { z } from 'zod';
import type { StoredDetail } from '../reading/detail-numbers-request.ts';
import { readNumberPair } from '../reading/reading.ts';

const detailNumbersReplySchema = z.strictObject({
  details: z.array(z.strictObject({ index: z.number().int(), number: z.number().nullable(), unit: z.string().nullable() })),
});

export function mergeDetailNumbers(details: StoredDetail[], reply: unknown): StoredDetail[] {
  const replied = detailNumbersReplySchema.parse(reply).details;
  return details.map((detail, index) => addNumberPair(detail, replied[index]));
}

function addNumberPair(detail: StoredDetail, reply: { number: number | null; unit: string | null } | undefined): StoredDetail {
  if ('number' in detail) return detail;
  return { ...detail, ...readNumberPair(reply?.number, reply?.unit) };
}
