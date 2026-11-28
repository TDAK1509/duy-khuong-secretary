import type { Clock } from '../../services/clock/clock.ts';
import type { SheetParser } from '../../services/sheets/sheet-parser.ts';
import type { FileStorage } from '../../services/storage/file-storage.ts';
import type { Database } from '../db/transaction.ts';
import type { FileClaim } from '../sheet-files/file-claims.ts';
import type { HeldFiles } from '../sheet-files/held-files.ts';
import { runFileStep, type FileOutcome, type FileWork } from '../sheet-files/run-file-step.ts';
import { reviewReturnedExport } from '../export-reviews/review-returned-export.ts';
import { parseSheet } from './parse-sheet.ts';
import { readFileBytes } from './read-file-bytes.ts';
import { formatHeadersFound, formatNoDataRows, formatParseFailure, formatTooManyRows, MAX_SHEET_ROWS } from './sheet-texts.ts';

export type ParseFilesDependencies = {
  database: Database;
  clock: Clock;
  maxTextLength: number;
  fileStorage: FileStorage;
  sheetParser: SheetParser;
  held: HeldFiles;
};

export function runParseFilesStep(dependencies: ParseFilesDependencies): Promise<'processed' | 'idle'> {
  return runFileStep(dependencies, buildParseWork(dependencies));
}

function buildParseWork(dependencies: ParseFilesDependencies): FileWork {
  return {
    step: 'parse',
    run: (claim) => parseFile(dependencies, claim),
    describeGiveUp: (claim) => formatParseFailure(claim.fileName),
  };
}

async function parseFile(dependencies: ParseFilesDependencies, claim: FileClaim): Promise<FileOutcome> {
  const bytes = await readFileBytes(dependencies.fileStorage, claim);
  const returned = claim.extension === 'xlsx' ? await reviewReturnedExport(dependencies.database, claim, bytes) : null;
  if (returned !== null) return returned;
  const parsed = await parseSheet(claim.extension, bytes, dependencies.sheetParser);
  if (!parsed.ok) return { text: formatParseFailure(claim.fileName), finishesFile: true };
  if (parsed.rows.length === 0) return { text: formatNoDataRows(claim.fileName), finishesFile: true };
  if (parsed.rows.length > MAX_SHEET_ROWS) return { text: formatTooManyRows(claim.fileName, MAX_SHEET_ROWS), finishesFile: true };
  return { text: formatHeadersFound(claim.fileName, { rowCount: parsed.rows.length, headers: parsed.headers, headerRowNumber: parsed.headerRowNumber }), finishesFile: false };
}
