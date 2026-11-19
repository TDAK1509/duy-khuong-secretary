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

const DATE_FORMATS = ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'] as const;

const SINGLE_FIELDS: readonly SheetMappingField[] = ['document_date', 'vehicle_plate', 'title', 'document_number', 'issuer_key', 'summary'];

export type SheetMappingField = (typeof MAPPING_FIELDS)[number];
export type SheetDateFormat = (typeof DATE_FORMATS)[number];

export const MAX_DOCUMENT_KIND_LENGTH = 60;
export const FALLBACK_DOCUMENT_KIND = 'khác';

const sheetReadingSchema = z.object({
  document_kind: z.string(),
  column_mapping: z.array(z.object({ column_index: z.number().int(), field: z.enum(MAPPING_FIELDS) })),
  date_format: z.enum(DATE_FORMATS),
});

export type ColumnRole = { columnIndex: number; field: SheetMappingField };

export type SheetReading = { documentKind: string; columnMapping: ColumnRole[]; dateFormat: SheetDateFormat };

export const SHEET_READER_SCHEMA_NAME = 'sheet_reading';

export const SHEET_READER_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    document_kind: { type: 'string' },
    column_mapping: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          column_index: { type: 'integer' },
          field: { type: 'string', enum: [...MAPPING_FIELDS] },
        },
        required: ['column_index', 'field'],
      },
    },
    date_format: { type: 'string', enum: [...DATE_FORMATS] },
  },
  required: ['document_kind', 'column_mapping', 'date_format'],
};

export type SheetReadAttempt = { ok: true; reading: SheetReading } | { ok: false; reason: string };

export function validateSheetReading(json: unknown, headerCount: number): SheetReadAttempt {
  const parsed = sheetReadingSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'invalid_shape' };
  const roles = parsed.data.column_mapping.map((role) => ({ columnIndex: role.column_index, field: role.field }));
  const problem = findMappingProblem(roles, headerCount);
  if (problem !== null) return { ok: false, reason: problem };
  return { ok: true, reading: { documentKind: trimKind(parsed.data.document_kind), columnMapping: roles, dateFormat: parsed.data.date_format } };
}

function findMappingProblem(roles: ColumnRole[], headerCount: number): string | null {
  if (roles.some((role) => role.columnIndex < 0 || role.columnIndex >= headerCount)) return 'column_out_of_range';
  if (new Set(roles.map((role) => role.columnIndex)).size !== roles.length) return 'column_twice';
  if (roles.filter((role) => role.field === 'document_date').length !== 1) return 'not_one_date';
  if (SINGLE_FIELDS.some((field) => roles.filter((role) => role.field === field).length > 1)) return 'field_twice';
  return null;
}

function trimKind(kind: string): string {
  const trimmed = kind.trim().slice(0, MAX_DOCUMENT_KIND_LENGTH).trim();
  return trimmed === '' ? FALLBACK_DOCUMENT_KIND : trimmed;
}
