import type { ReaderService } from '../../services/reading/reader-service.ts';
import { buildSheetReaderParts, SHEET_READER_PROMPT, type SheetReaderInput } from './sheet-reader-prompt.ts';
import {
  SHEET_READER_SCHEMA,
  SHEET_READER_SCHEMA_NAME,
  validateSheetReading,
  type SheetReading,
} from './sheet-reader-schema.ts';

export type SheetReadOutcome = { ok: true; reading: SheetReading } | { ok: false };

export async function readSheet(reader: ReaderService, input: SheetReaderInput): Promise<SheetReadOutcome> {
  const result = await reader.read({
    system: SHEET_READER_PROMPT,
    userParts: buildSheetReaderParts(input),
    schemaName: SHEET_READER_SCHEMA_NAME,
    schema: SHEET_READER_SCHEMA,
  });
  if (!result.ok) return { ok: false };
  const attempt = validateSheetReading(result.json, input.headers.length);
  if (!attempt.ok) console.error(`[sheet-reader] answer rejected reason=${attempt.reason}`);
  return attempt.ok ? attempt : { ok: false };
}
