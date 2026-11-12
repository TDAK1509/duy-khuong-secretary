import type { QuotedMessage } from '../delivery/claimed-message.ts';
import type { RecordSource, SourceEvent } from '../records/record-source.ts';
import { formatSourceCard } from './format-source-card.ts';

export const MAX_SOURCE_CARDS = 5;

export type Conversation = { channel: string; accountId: string; externalUserId: string };

export type SourceCard = { messageId: string; text: string; quote?: QuotedMessage };

export class SourceCards {
  private readonly sources = new Map<string, RecordSource>();

  private readonly conversation: Conversation | null;

  constructor(conversation: Conversation | null = null) {
    this.conversation = conversation;
  }

  add(source: RecordSource): number | null {
    const known = this.sources.get(source.messageId);
    if (known === undefined && this.sources.size === MAX_SOURCE_CARDS) return null;
    this.sources.set(source.messageId, known === undefined ? source : mergeSources(known, source));
    return [...this.sources.keys()].indexOf(source.messageId) + 1;
  }

  isQuoted(messageId: string): boolean {
    const source = this.sources.get(messageId);
    return source !== undefined && findQuote(source, this.conversation) !== null;
  }

  list(): SourceCard[] {
    return [...this.sources.values()].map((source, index) => this.describeCard(index + 1, source));
  }

  private describeCard(cardNumber: number, source: RecordSource): SourceCard {
    const quote = findQuote(source, this.conversation);
    return { messageId: source.messageId, text: formatSourceCard(cardNumber, source), ...(quote !== null && { quote }) };
  }
}

function findQuote(source: RecordSource, conversation: Conversation | null): QuotedMessage | null {
  if (!isInConversation(source, conversation)) return null;
  if (source.imageKey === null) return { messageId: source.event.externalEventId };
  return { messageId: source.event.externalEventId, fallbackPhotoKey: source.imageKey };
}

function isInConversation(source: RecordSource, conversation: Conversation | null): source is RecordSource & { event: SourceEvent } {
  const { event } = source;
  if (conversation === null || event === null || !source.isOwn) return false;
  return event.channel === conversation.channel && event.accountId === conversation.accountId && event.externalUserId === conversation.externalUserId;
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
