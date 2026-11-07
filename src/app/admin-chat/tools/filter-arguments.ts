import { z } from 'zod';
import type { RecordFilters } from '../../records/search-records.ts';
import { isRealIsoDate } from '../../time/is-real-iso-date.ts';

export const FILTER_ARGUMENTS = {
  text: z.string().nullable(),
  category: z.string().nullable(),
  member: z.string().nullable(),
  plate: z.string().nullable(),
  added_from: z.string().nullable(),
  added_to: z.string().nullable(),
  occurred_from: z.string().nullable().default(null),
  occurred_to: z.string().nullable().default(null),
};

export type FilterArguments = z.infer<z.ZodObject<typeof FILTER_ARGUMENTS>>;

export function hasUnrealDate(args: FilterArguments): boolean {
  const dates = [args.added_from, args.added_to, args.occurred_from, args.occurred_to];
  return dates.some((date) => date !== null && !isRealIsoDate(date));
}

export function toRecordFilters(args: FilterArguments): RecordFilters {
  return {
    text: args.text,
    category: args.category,
    member: args.member,
    plate: args.plate,
    addedFrom: args.added_from,
    addedTo: args.added_to,
    occurredFrom: args.occurred_from,
    occurredTo: args.occurred_to,
  };
}
