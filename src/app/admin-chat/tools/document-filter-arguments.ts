import { z } from 'zod';
import type { DocumentFilters } from '../../documents/add-document-filters.ts';

export const DOCUMENT_FILTER_ARGUMENTS = {
  organization: z.string().nullable(),
  role: z.enum(['issuer', 'supplier', 'customer', 'carrier', 'place']).nullable(),
  stage: z.enum(['dispatch', 'receipt']).nullable(),
  kind: z.string().nullable(),
  date_meaning: z.string().nullable(),
};

export type DocumentFilterArguments = z.infer<z.ZodObject<typeof DOCUMENT_FILTER_ARGUMENTS>>;

export function buildDocumentFilters(args: DocumentFilterArguments): DocumentFilters {
  return { organization: args.organization, role: args.role, stage: args.stage, kind: args.kind, dateMeaning: args.date_meaning };
}
