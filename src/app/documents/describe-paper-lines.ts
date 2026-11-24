import type { ReadingDetail } from '../reading/reading.ts';
import { buildMatchKey } from './build-match-key.ts';
import type { DocumentDraft } from './document-draft.ts';
import { listLineDetails } from './insert-lines.ts';
import { parseDateTime } from './parse-date-time.ts';

const MIDNIGHT_SUFFIX = 'T00:00:00';

export type PaperLines = { kilograms: number[]; printedTimes: string[] };

export function describePaperLines(draft: DocumentDraft): PaperLines {
  const storedDetails = listLineDetails(draft).filter(hasMeaning);
  return {
    kilograms: [...new Set(storedDetails.flatMap(readDocumentKilograms))].sort((first, second) => first - second),
    printedTimes: [...new Set(storedDetails.flatMap(readPrintedTime))].sort(),
  };
}

function hasMeaning(detail: ReadingDetail): boolean {
  return buildMatchKey(detail.meaning ?? '') !== '';
}

function readDocumentKilograms(detail: ReadingDetail): number[] {
  const belongsToWholePaper = !detail.item?.trim();
  return belongsToWholePaper && detail.line_unit === 'kg' && detail.line_number !== null ? [detail.line_number] : [];
}

function readPrintedTime(detail: ReadingDetail): string[] {
  const moment = parseDateTime(detail.date_time);
  return moment !== null && !moment.endsWith(MIDNIGHT_SUFFIX) ? [moment] : [];
}
