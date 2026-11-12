import { describe, expect, it } from 'vitest';
import { SourceCards } from '../../../src/app/admin-chat/source-cards.ts';
import type { RecordSource } from '../../../src/app/records/record-source.ts';

function makeSource(messageId: string): RecordSource {
  return {
    messageId,
    recordIds: [`record-of-${messageId}`],
    sender: 'Hùng',
    isOwn: false,
    sentAt: new Date('2026-11-12T01:15:00Z'),
    kind: 'text',
    paperDates: [],
    text: messageId,
  };
}

describe('the source cards of one turn', () => {
  it('keeps one card number for the same message added twice', () => {
    const cards = new SourceCards();

    const numbers = [cards.add(makeSource('a')), cards.add(makeSource('a'))];

    expect(numbers).toEqual([1, 1]);
    expect(cards.list()).toHaveLength(1);
  });

  it('gives no card to a sixth message', () => {
    const cards = new SourceCards();

    const numbers = ['a', 'b', 'c', 'd', 'e', 'f'].map((messageId) => cards.add(makeSource(messageId)));

    expect(numbers).toEqual([1, 2, 3, 4, 5, null]);
    expect(cards.list()).toHaveLength(5);
  });
});
