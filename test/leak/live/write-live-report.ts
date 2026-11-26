import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CaseResult, LiveSummary } from './live-result.ts';

export const REPORT_FILE_NAME = 'report.json';

export async function writeLiveReport(directory: string, summary: LiveSummary, results: CaseResult[]): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, REPORT_FILE_NAME), `${JSON.stringify({ summary, results }, null, 2)}\n`);
}
