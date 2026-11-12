import type { RecordSource } from '../records/record-source.ts';
import { formatSourceCard } from './format-source-card.ts';

export const MAX_SOURCE_CARDS = 5;

export class SourceCards {
  private readonly sources = new Map<string, RecordSource>();

  add(source: RecordSource): number | null {
    if (!this.sources.has(source.messageId)) {
      if (this.sources.size === MAX_SOURCE_CARDS) return null;
      this.sources.set(source.messageId, source);
    }
    return [...this.sources.keys()].indexOf(source.messageId) + 1;
  }

  list(): string[] {
    return [...this.sources.values()].map((source, index) => formatSourceCard(index + 1, source));
  }
}
