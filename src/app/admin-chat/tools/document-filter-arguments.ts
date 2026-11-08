import { z } from 'zod';
import type { DocumentFilters } from '../../documents/add-document-filters.ts';

export const DOCUMENT_FILTER_ARGUMENTS = {
  organization: z.string().nullable(),
  stage: z.enum(['dispatch', 'receipt']).nullable(),
  date_meaning: z.string().nullable(),
};

export type DocumentFilterArguments = z.infer<z.ZodObject<typeof DOCUMENT_FILTER_ARGUMENTS>>;

export function buildDocumentFilters(args: DocumentFilterArguments): DocumentFilters {
  return { organization: args.organization, stage: args.stage, dateMeaning: args.date_meaning };
}
