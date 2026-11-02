import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Clock } from '../../services/clock/clock.ts';
import type { ReaderRequest } from '../../services/reading/reader-service.ts';
import type { Photo } from '../../services/storage/photo-storage.ts';
import { decideReading, type ReaderSlots } from './decide-reading.ts';
import { formatPhotoReport } from './format-photo-report.ts';
import { listPhotoFiles } from './list-photo-files.ts';
import { buildReaderPrompt } from './reader-prompt.ts';
import { READER_SCHEMA, READER_SCHEMA_NAME } from './reader-schema.ts';
import { loadExpectedAnswers } from './load-expected-answers.ts';
import { summarizeResults, type PhotoResult } from './summarize-results.ts';

const MAX_PHOTO_BYTES = 5_000_000;

export type EvaluationInput = {
  folderPath: string;
  slots: ReaderSlots;
  clock: Clock;
  print: (line: string) => void;
};

export async function evaluateReaders(input: EvaluationInput): Promise<void> {
  const system = buildReaderPrompt(input.clock.now());
  const results: PhotoResult[] = [];
  for (const filePath of await listPhotoFiles(input.folderPath)) {
    const result = await evaluatePhoto(input, system, filePath);
    if (result) results.push(result);
  }
  const expected = await loadExpectedAnswers(input.folderPath);
  summarizeResults(results, expected).forEach(input.print);
}

async function evaluatePhoto(input: EvaluationInput, system: string, filePath: string): Promise<PhotoResult | null> {
  const fileName = basename(filePath);
  const { size } = await stat(filePath);
  if (size > MAX_PHOTO_BYTES) {
    input.print(`${fileName}: not read, larger than 5 MB (${size} bytes)`);
    return null;
  }
  const decision = await decideReading(input.slots, await buildRequest(system, filePath));
  const result = { fileName, decision };
  formatPhotoReport(result, input.slots).forEach(input.print);
  return result;
}

async function buildRequest(system: string, filePath: string): Promise<ReaderRequest> {
  const image = await loadPhoto(filePath);
  return { system, text: null, image, schemaName: READER_SCHEMA_NAME, schema: READER_SCHEMA };
}

async function loadPhoto(filePath: string): Promise<Photo> {
  const bytes = await readFile(filePath);
  const isPng = extname(filePath).toLowerCase() === '.png';
  return { bytes, contentType: isPng ? 'image/png' : 'image/jpeg' };
}
