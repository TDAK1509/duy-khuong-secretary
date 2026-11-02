import { areAgreeing } from './agreement.ts';
import type { AttemptPair, ReaderPair, ReaderSlots } from './decide-reading.ts';
import type { PhotoResult } from './summarize-results.ts';
import type { ReadAttempt } from './reading.ts';

export function formatPhotoReport(result: PhotoResult, slots: ReaderSlots): string[] {
  const { fileName, decision } = result;
  return [
    `== ${fileName} ==`,
    ...formatPairReport('cheap', slots.cheap, decision.cheap),
    ...(decision.strong ? formatPairReport('strong', slots.strong, decision.strong) : []),
    `outcome: ${decision.outcome}`,
  ];
}

function formatPairReport(name: string, readers: ReaderPair, attempts: AttemptPair): string[] {
  const [firstReader, secondReader] = readers;
  const [firstAttempt, secondAttempt] = attempts;
  return [
    `${firstReader.label}: ${describeAttempt(firstAttempt)}`,
    `${secondReader.label}: ${describeAttempt(secondAttempt)}`,
    `${name} pair agrees: ${areAgreeing(firstAttempt, secondAttempt) ? 'yes' : 'no'}`,
  ];
}

function describeAttempt(attempt: ReadAttempt): string {
  return attempt.ok ? JSON.stringify(attempt.reading) : `failed (${attempt.reason})`;
}
