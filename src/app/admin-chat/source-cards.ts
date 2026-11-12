import type { RecordSource } from '../records/record-source.ts';
import { formatSourceCard } from './format-source-card.ts';

export const MAX_SOURCE_CARDS = 5;

export class SourceCards {
  private readonly sources = new Map<string, RecordSource>();

  add(source: RecordSource): number | null {
    const known = this.sources.get(source.messageId);
    if (known === undefined && this.sources.size === MAX_SOURCE_CARDS) return null;
    this.sources.set(source.messageId, known === undefined ? source : mergeSources(known, source));
    return [...this.sources.keys()].indexOf(source.messageId) + 1;
  }

  list(): string[] {
    return [...this.sources.values()].map((source, index) => formatSourceCard(index + 1, source));
  }
}

function mergeSources(known: RecordSource, added: RecordSource): RecordSource {
  return {
    ...known,
    recordIds: unionOf(known.recordIds, added.recordIds),
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
