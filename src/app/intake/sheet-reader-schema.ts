import { z } from 'zod';
import type { JsonSchema } from '../../services/reading/reader-service.ts';

const MAPPING_FIELDS = [
  'document_date',
  'vehicle_plate',
  'title',
  'document_number',
  'issuer_key',
  'summary',
  'detail',
  'ignore',
] as const;

const DATE_FORMATS = ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'other'] as const;

export type SheetMappingField = (typeof MAPPING_FIELDS)[number];
export type SheetDateFormat = (typeof DATE_FORMATS)[number];

export const MAX_DOCUMENT_KIND_LENGTH = 60;
export const FALLBACK_DOCUMENT_KIND = 'khác';

const sheetReadingSchema = z.strictObject({
  document_kind: z.string().max(MAX_DOCUMENT_KIND_LENGTH),
  column_mapping: z.record(z.string(), z.enum(MAPPING_FIELDS)),
  date_format: z.enum(DATE_FORMATS).nullable(),
});

export type SheetReading = z.infer<typeof sheetReadingSchema>;

export const SHEET_READER_SCHEMA_NAME = 'sheet_reading';

export const SHEET_READER_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    document_kind: { type: 'string', maxLength: MAX_DOCUMENT_KIND_LENGTH },
    column_mapping: {
      type: 'object',
      additionalProperties: { type: 'string', enum: [...MAPPING_FIELDS] },
    },
    date_format: { type: ['string', 'null'], enum: [...DATE_FORMATS, null] },
  },
  required: ['document_kind', 'column_mapping', 'date_format'],
};

export type SheetReadAttempt = { ok: true; reading: SheetReading } | { ok: false };

export function validateSheetReading(json: unknown): SheetReadAttempt {
  const parsed = sheetReadingSchema.safeParse(json);
  return parsed.success ? { ok: true, reading: parsed.data } : { ok: false };
}
