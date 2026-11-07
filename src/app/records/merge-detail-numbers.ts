import { z } from 'zod';
import type { StoredDetail } from '../reading/detail-numbers-request.ts';
import { readNumberPair } from '../reading/reading.ts';

type ReplyDetail = { index: number; number?: unknown; unit?: unknown };

const detailNumbersReplySchema = z.strictObject({
  details: z.array(z.strictObject({ index: z.number().int(), number: z.unknown(), unit: z.unknown() })),
});

export function mergeDetailNumbers(details: StoredDetail[], reply: unknown): StoredDetail[] | null {
  const parsed = detailNumbersReplySchema.safeParse(reply);
  if (!parsed.success || !repliesToEachIndexOnce(details, parsed.data.details)) return null;
  return details.map((detail, index) => addNumberPair(detail, parsed.data.details.find((entry) => entry.index === index)));
}

function repliesToEachIndexOnce(details: StoredDetail[], replied: ReplyDetail[]): boolean {
  return replied.length === details.length && details.every((_, index) => replied.some((entry) => entry.index === index));
}

function addNumberPair(detail: StoredDetail, reply: ReplyDetail | undefined): StoredDetail {
  if ('number' in detail) return detail;
  return { ...detail, ...readNumberPair(reply?.number, reply?.unit) };
}
