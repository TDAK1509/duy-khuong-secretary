import type { QuotedMessage } from '../delivery/claimed-message.ts';
import type { RecordSource, SourceEvent } from '../records/record-source.ts';
import { mergeSources } from '../records/merge-sources.ts';
import { formatSourceCard } from './format-source-card.ts';

export const MAX_SOURCE_CARDS = 5;

export type Conversation = { channel: string; accountId: string; externalUserId: string };

export type CardDelivery = { quote?: QuotedMessage; albumPhotoKey?: string };

export type SourceCard = CardDelivery & { messageId: string; text: string };

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
    return source !== undefined && findDelivery(source, this.conversation).quote !== undefined;
  }

  list(): SourceCard[] {
    return [...this.sources.values()].map((source, index) => this.describeCard(index + 1, source));
  }

  private describeCard(cardNumber: number, source: RecordSource): SourceCard {
    return { messageId: source.messageId, text: formatSourceCard(cardNumber, source), ...findDelivery(source, this.conversation) };
  }
}

function findDelivery(source: RecordSource, conversation: Conversation | null): CardDelivery {
  if (!isInConversation(source, conversation)) return {};
  const messageId = source.event.externalEventId;
  if (source.imageKey === null) return { quote: { messageId } };
  if (hasSeveralPhotos(source.event)) return { albumPhotoKey: source.imageKey };
  return { quote: { messageId, fallbackPhotoKey: source.imageKey } };
}

function hasSeveralPhotos({ photoCount }: SourceEvent): boolean {
  return photoCount !== null && photoCount > 1;
}

function isInConversation(source: RecordSource, conversation: Conversation | null): source is RecordSource & { event: SourceEvent } {
  const { event } = source;
  if (conversation === null || event === null || !source.isOwn) return false;
  return event.channel === conversation.channel && event.accountId === conversation.accountId && event.externalUserId === conversation.externalUserId;
}
