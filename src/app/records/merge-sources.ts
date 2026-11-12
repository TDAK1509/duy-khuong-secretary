import type { RecordSource } from './record-source.ts';

export function mergeSourcesByMessage(sources: RecordSource[]): RecordSource[] {
  const merged = new Map<string, RecordSource>();
  for (const source of sources) {
    const known = merged.get(source.messageId);
    merged.set(source.messageId, known === undefined ? source : mergeSources(known, source));
  }
  return [...merged.values()];
}

export function mergeSources(known: RecordSource, added: RecordSource): RecordSource {
  return {
    ...known,
    recordIds: unionOf(known.recordIds, added.recordIds),
    documentIds: unionOf(known.documentIds, added.documentIds),
    paperDates: unionOf(known.paperDates, added.paperDates).sort(compareDayMonthYear),
  };
}

function unionOf(first: string[], second: string[]): string[] {
  return [...new Set([...first, ...second])];
}

function compareDayMonthYear(first: string, second: string): number {
  return toYearMonthDay(first).localeCompare(toYearMonthDay(second));
}

function toYearMonthDay(dayMonthYear: string): string {
  return dayMonthYear.split('/').reverse().join('-');
}
