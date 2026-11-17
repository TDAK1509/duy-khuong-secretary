import type { ReaderService } from '../../services/reading/reader-service.ts';
import { buildSheetReaderPrompt, type SheetReaderInput } from './sheet-reader-prompt.ts';
import {
  SHEET_READER_SCHEMA,
  SHEET_READER_SCHEMA_NAME,
  validateSheetReading,
  type SheetReading,
} from './sheet-reader-schema.ts';

export type SheetReadOutcome = { ok: true; reading: SheetReading } | { ok: false };

export async function readSheet(reader: ReaderService, input: SheetReaderInput): Promise<SheetReadOutcome> {
  const result = await reader.read({
    system: buildSheetReaderPrompt(input),
    text: null,
    image: null,
    schemaName: SHEET_READER_SCHEMA_NAME,
    schema: SHEET_READER_SCHEMA,
  });
  if (!result.ok) return { ok: false };
  return validateSheetReading(result.json);
}
