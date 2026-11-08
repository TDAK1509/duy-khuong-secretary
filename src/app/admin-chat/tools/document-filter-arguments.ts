import { z } from 'zod';
import type { DocumentFilters } from '../../documents/add-document-filters.ts';

export const DOCUMENT_FILTER_ARGUMENTS = {
  organization: z.string().nullable(),
  role: z.enum(['issuer', 'supplier', 'customer', 'carrier', 'place']).nullable(),
  stage: z.enum(['dispatch', 'receipt']).nullable(),
  kind: z.string().nullable(),
  plate: z.string().nullable(),
  date_meaning: z.string().nullable(),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
};

export type DocumentFilterArguments = z.infer<z.ZodObject<typeof DOCUMENT_FILTER_ARGUMENTS>>;

export function buildDocumentFilters(args: DocumentFilterArguments): DocumentFilters {
  return {
    organization: args.organization,
    role: args.role,
    stage: args.stage,
    kind: args.kind,
    plate: args.plate,
    dateMeaning: args.date_meaning,
    dateFrom: args.date_from,
    dateTo: args.date_to,
  };
}
