import { describe, expect, it } from 'vitest';
import { formatSourceCard } from '../../../src/app/admin-chat/format-source-card.ts';
import type { RecordSource } from '../../../src/app/records/record-source.ts';

function makeSource(overrides: Partial<RecordSource> = {}): RecordSource {
  return {
    messageId: 'message-1',
    recordIds: ['record-1'],
    sender: 'Hùng',
    isOwn: false,
    sentAt: new Date('2026-11-12T01:15:00Z'),
    kind: 'text',
    paperDates: [],
    text: 'Đổ dầu 500k xe 29C12345',
    ...overrides,
  };
}

describe('a source card', () => {
  it('shows the sender, the time and the original text of another person\'s text message', () => {
    expect(formatSourceCard(1, makeSource())).toBe('Nguồn 1: Hùng gửi tin nhắn lúc 08:15 ngày 12/11/2026.\nNguyên văn: "Đổ dầu 500k xe 29C12345"');
  });

  it('shows the paper date and no original text line for a photo with no caption', () => {
    const source = makeSource({ kind: 'photo', paperDates: ['30/10/2026'], text: null });

    expect(formatSourceCard(2, source)).toBe('Nguồn 2: Hùng gửi ảnh lúc 08:15 ngày 12/11/2026.\nNgày trên giấy tờ: 30/10/2026.');
  });

  it('says "Bạn" for the caller\'s own message', () => {
    const source = makeSource({ isOwn: true });

    expect(formatSourceCard(1, source)).toMatch(/^Nguồn 1: Bạn gửi tin nhắn/);
  });

  it('lists two paper dates', () => {
    const source = makeSource({ paperDates: ['29/10/2026', '30/10/2026'] });

    expect(formatSourceCard(1, source)).toContain('Ngày trên giấy tờ: 29/10/2026, 30/10/2026.');
  });
});
