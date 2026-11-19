import { runParseFilesStep } from '../app/intake/run-parse-files-step.ts';
import { runProcessFilesStep } from '../app/intake/run-process-files-step.ts';
import { HeldFiles } from '../app/sheet-files/held-files.ts';
import type { Database } from '../app/db/transaction.ts';
import { ExcelJsSheetParser } from '../providers/sheets/exceljs-sheet-parser.ts';
import type { Clock } from '../services/clock/clock.ts';
import type { MessagingChannel } from '../services/messaging/messaging-channel.ts';
import type { ReaderService } from '../services/reading/reader-service.ts';
import type { FileStorage } from '../services/storage/file-storage.ts';

export type FileStepParts = { database: Database; clock: Clock; channel: MessagingChannel | null; fileStorage: FileStorage | null; reader: ReaderService | null; log: (line: string) => void };

export type FileSteps = {
  runParseFilesStep: (() => Promise<'processed' | 'idle'>) | null;
  runProcessFilesStep: (() => Promise<'processed' | 'idle'>) | null;
  heldFiles: HeldFiles;
};

export function buildFileSteps({ database, clock, channel, fileStorage, reader, log }: FileStepParts): FileSteps {
  const heldFiles = new HeldFiles();
  const parseMissing = [...(channel ? [] : ['zalo']), ...(fileStorage ? [] : ['photos'])];
  const processMissing = [...parseMissing, ...(reader ? [] : ['readers'])];
  if (parseMissing.length > 0) log(`[config] files-parse is off; missing: ${parseMissing.join(', ')}.`);
  if (processMissing.length > 0) log(`[config] files-process is off; missing: ${processMissing.join(', ')}.`);
  if (!channel || !fileStorage) return { runParseFilesStep: null, runProcessFilesStep: null, heldFiles };
  const base = { database, clock, maxTextLength: channel.maxTextLength, fileStorage, sheetParser: new ExcelJsSheetParser(), held: heldFiles };
  return {
    runParseFilesStep: () => runParseFilesStep(base),
    runProcessFilesStep: reader ? () => runProcessFilesStep({ ...base, reader }) : null,
    heldFiles,
  };
}
