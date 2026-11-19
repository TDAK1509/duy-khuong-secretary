import type { Clock } from '../../services/clock/clock.ts';
import type { SheetParser } from '../../services/sheets/sheet-parser.ts';
import type { FileStorage } from '../../services/storage/file-storage.ts';
import type { Database } from '../db/transaction.ts';
import type { FileClaim } from '../sheet-files/file-claims.ts';
import type { HeldFiles } from '../sheet-files/held-files.ts';
import { runFileStep, type FileOutcome, type FileWork } from '../sheet-files/run-file-step.ts';
import { parseSheet } from './parse-sheet.ts';
import { formatHeadersFound, formatNoDataRows, formatParseFailure } from './sheet-texts.ts';

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
  const bytes = await dependencies.fileStorage.get(claim.fileKey);
  const parsed = bytes === null ? { ok: false as const } : await parseSheet(claim.extension, bytes, dependencies.sheetParser);
  if (!parsed.ok) return { text: formatParseFailure(claim.fileName), finishesFile: true };
  if (parsed.rows.length === 0) return { text: formatNoDataRows(claim.fileName), finishesFile: true };
  return { text: formatHeadersFound(claim.fileName, parsed.rows.length, parsed.headers), finishesFile: false };
}
