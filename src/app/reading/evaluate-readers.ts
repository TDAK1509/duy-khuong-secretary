import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Clock } from '../../services/clock/clock.ts';
import type { ReaderRequest } from '../../services/reading/reader-service.ts';
import type { Photo } from '../../services/storage/photo-storage.ts';
import { decideReading, type ReaderSlots } from './decide-reading.ts';
import { listPhotoFiles } from './list-photo-files.ts';
import { buildReaderPrompt } from './reader-prompt.ts';
import { READER_SCHEMA, READER_SCHEMA_NAME } from './reader-schema.ts';
import { loadExpectedAnswers } from './load-expected-answers.ts';
import { summarizeResults, type PhotoResult } from './summarize-results.ts';

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
    const decision = await decideReading(input.slots, await buildRequest(system, filePath));
    results.push({ fileName: basename(filePath), decision });
  }
  const expected = await loadExpectedAnswers(input.folderPath);
  summarizeResults(results, expected).forEach(input.print);
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
