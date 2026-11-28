import { WEIGHT_MEANING } from '../facts/fact-value-totals.ts';
import type { ReadingDetail } from '../reading/reading.ts';
import { buildMatchKey } from './build-match-key.ts';
import type { DocumentDraft } from './document-draft.ts';
import { listLineDetails } from './insert-lines.ts';
import { parseDateTime } from './parse-date-time.ts';

const MIDNIGHT_SUFFIX = 'T00:00:00';
const WEIGHT_MATCH_KEY = buildMatchKey(WEIGHT_MEANING);
const WEIGH_TICKET_KEY = 'phieucan';
const MESSAGE_KEY = 'tinnhan';

export type TripTicket = {
  plate: string;
  date: string;
  isReceipt: boolean;
  netKilograms: number;
  printedTimes: string[];
};

export function describeTripTicket(draft: DocumentDraft): TripTicket | null {
  const { documentDate: date, vehiclePlate: plate } = draft;
  const details = listLineDetails(draft);
  const netKilograms = readNetKilograms(details);
  if (date === null || plate === null || netKilograms === null || !hasTripTicketShape(draft, details)) return null;
  return { plate, date, isReceipt: draft.items[0]?.item.stage === 'receipt', netKilograms, printedTimes: listPrintedTimes(details) };
}

export function sharePrintedTime(first: string[], second: string[]): boolean {
  return first.length === 0 || second.length === 0 || first.some((time) => second.includes(time));
}

function listPrintedTimes(details: ReadingDetail[]): string[] {
  return [...new Set(details.filter(hasMeaning).flatMap(readPrintedTime))].sort();
}

function hasTripTicketShape(draft: DocumentDraft, details: ReadingDetail[]): boolean {
  const first = draft.items[0]?.item;
  if (first === undefined || details.some((detail) => detail.item?.trim())) return false;
  const kindKey = buildMatchKey(first.document_kind);
  const hasTripStage = first.stage !== null || kindKey.includes(WEIGH_TICKET_KEY);
  return hasTripStage && kindKey !== MESSAGE_KEY;
}

function readNetKilograms(details: ReadingDetail[]): number | null {
  const weight = details.find((detail) => !detail.date_time && !detail.item?.trim() && buildMatchKey(detail.meaning ?? '') === WEIGHT_MATCH_KEY);
  return weight?.line_unit === 'kg' ? weight.line_number : null;
}

function hasMeaning(detail: ReadingDetail): boolean {
  return buildMatchKey(detail.meaning ?? '') !== '';
}

function readPrintedTime(detail: ReadingDetail): string[] {
  const moment = parseDateTime(detail.date_time);
  return moment !== null && !moment.endsWith(MIDNIGHT_SUFFIX) ? [moment] : [];
}
