import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { SheetParser } from '../../services/sheets/sheet-parser.ts';
import type { FileStorage } from '../../services/storage/file-storage.ts';
import { hasCredits } from '../credits/has-credits.ts';
import { meterReader } from '../credits/meter-reader.ts';
import type { Database } from '../db/transaction.ts';
import type { FileClaim } from '../sheet-files/file-claims.ts';
import type { HeldFiles } from '../sheet-files/held-files.ts';
import { runFileStep, type FileOutcome, type FileWork, type RenewLease } from '../sheet-files/run-file-step.ts';
import { OUT_OF_CREDIT_TEXT } from './intake-texts.ts';
import { mapRowToDraft, planSheetMapping, type SheetMappingPlan } from './map-sheet-rows.ts';
import type { SheetRow } from '../../services/sheets/sheet-parser.ts';
import { parseSheet } from './parse-sheet.ts';
import { readSheet, type SheetReadOutcome } from './read-sheet.ts';
import {
  formatParseFailure,
  formatSavedAndSkipped,
  formatTooManyRows,
  MAX_SHEET_ROWS,
  SHEET_CAPTION_USED_TEXT,
  SHEET_READER_FAILURE_TEXT,
} from './sheet-texts.ts';

const MAX_PREVIEW_ROWS = 10;

export type ProcessFilesDependencies = {
  database: Database;
  clock: Clock;
  maxTextLength: number;
  reader: ReaderService;
  fileStorage: FileStorage;
  sheetParser: SheetParser;
  held: HeldFiles;
};

type FileRows = { claim: FileClaim; headers: string[]; contextLines: string[]; rows: SheetRow[] };

export function runProcessFilesStep(dependencies: ProcessFilesDependencies): Promise<'processed' | 'idle'> {
  return runFileStep(dependencies, buildProcessWork(dependencies));
}

function buildProcessWork(dependencies: ProcessFilesDependencies): FileWork {
  return {
    step: 'process',
    run: (claim, renewLease) => processFile(dependencies, claim, renewLease),
    describeGiveUp: () => SHEET_READER_FAILURE_TEXT,
  };
}

async function processFile(dependencies: ProcessFilesDependencies, claim: FileClaim, renewLease: RenewLease): Promise<FileOutcome> {
  const bytes = await dependencies.fileStorage.get(claim.fileKey);
  const parsed = bytes === null ? { ok: false as const } : await parseSheet(claim.extension, bytes, dependencies.sheetParser);
  if (!parsed.ok) return { text: formatParseFailure(claim.fileName), finishesFile: true };
  if (parsed.rows.length > MAX_SHEET_ROWS) return { text: formatTooManyRows(claim.fileName, MAX_SHEET_ROWS), finishesFile: true };
  return readAndMap(dependencies, { claim, headers: parsed.headers, contextLines: parsed.contextLines, rows: parsed.rows }, renewLease);
}

async function readAndMap(dependencies: ProcessFilesDependencies, file: FileRows, renewLease: RenewLease): Promise<FileOutcome> {
  await renewLease();
  if (!(await hasCredits(dependencies.database, file.claim.workspaceId))) return { text: OUT_OF_CREDIT_TEXT, finishesFile: true };
  const outcome = await callSheetReader(dependencies, file);
  await renewLease();
  if (!outcome.ok) return { text: SHEET_READER_FAILURE_TEXT, finishesFile: true };
  return mapRows(file, planSheetMapping(outcome.reading, file.headers));
}

async function callSheetReader(dependencies: ProcessFilesDependencies, { claim, headers, contextLines, rows }: FileRows): Promise<SheetReadOutcome> {
  const meter = { database: dependencies.database, workspaceId: claim.workspaceId, charged: { clock: dependencies.clock, maxTextLength: dependencies.maxTextLength } };
  const metered = meterReader(dependencies.reader, meter, () => 'text_read');
  return readSheet(metered, { fileName: claim.fileName, caption: claim.caption, contextLines, headers, dataRows: rows.slice(0, MAX_PREVIEW_ROWS).map((row) => row.cells) });
}

function mapRows({ claim, headers, rows }: FileRows, plan: SheetMappingPlan): FileOutcome {
  const attempts = rows.map((row, index) => mapRowToDraft(plan, { row, position: index + 1 }, headers));
  const drafts = attempts.flatMap((attempt) => (attempt.ok ? [attempt.draft] : []));
  const skipped = attempts.flatMap((attempt) => (attempt.ok ? [] : [attempt.rowNumber]));
  const text = formatSavedAndSkipped(drafts.length, rows.length, plan.kind, skipped);
  return { text: claim.caption === null ? text : `${SHEET_CAPTION_USED_TEXT} ${text}`, finishesFile: true, drafts };
}
