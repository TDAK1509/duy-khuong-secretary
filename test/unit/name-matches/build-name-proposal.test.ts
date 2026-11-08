import { describe, expect, it } from 'vitest';
import { buildNameProposal, type WaitingPair } from '../../../src/app/name-matches/build-name-proposal.ts';

const CHENG_LOONG = 'Công ty TNHH Cheng Loong Bình Dương Paper';
const CHONG_LOONG = 'Công ty TNHH Chống Loong Bình Dương Paper';

describe('buildNameProposal', () => {
  it('lists each pair with its document count, the pair with more documents first', () => {
    const waiting = [
      makePair({ printedName: CHONG_LOONG, organizationName: CHENG_LOONG, documentCount: 1 }),
      makePair({ printedName: 'Cty Hoa Phat', organizationName: 'Công ty Hòa Phát', documentCount: 4 }),
    ];

    const { text } = buildNameProposal(waiting);

    expect(text).toBe(
      [
        'Tên mới đọc được gần giống tên đã lưu:',
        '1. "Cty Hoa Phat" → "Công ty Hòa Phát" (4 giấy tờ)',
        `2. "${CHONG_LOONG}" → "${CHENG_LOONG}" (1 giấy tờ)`,
        'Trả lời số để xác nhận là cùng một bên. Trả lời 0 nếu không có cặp nào đúng. Khi chưa xác nhận, các giấy tờ này chưa được tính theo tên đó.',
      ].join('\n'),
    );
  });

  it('lists nine pairs and tells how many more wait when eleven pairs wait', () => {
    const waiting = Array.from({ length: 11 }, (_, index) =>
      makePair({ matchKey: `key${index}`, printedName: `printed ${index}`, documentCount: 11 - index }),
    );

    const { listed, text } = buildNameProposal(waiting);

    const lines = text.split('\n');
    expect(listed.map((pair) => pair.matchKey)).toEqual(waiting.slice(0, 9).map((pair) => pair.matchKey));
    expect(lines.filter((line) => /^\d+\. /.test(line))).toHaveLength(9);
    expect(lines.at(-1)).toBe('Còn 2 cặp nữa sẽ gửi sau khi bạn trả lời.');
  });

  it('orders pairs with equal counts by printed name, then match key, then organization id', () => {
    const waiting = [
      makePair({ printedName: 'b', matchKey: 'k1', organizationId: 'o1' }),
      makePair({ printedName: 'a', matchKey: 'k2', organizationId: 'o1' }),
      makePair({ printedName: 'a', matchKey: 'k1', organizationId: 'o2' }),
      makePair({ printedName: 'a', matchKey: 'k1', organizationId: 'o1' }),
    ];

    const { listed } = buildNameProposal(waiting);

    expect(listed.map((pair) => [pair.printedName, pair.matchKey, pair.organizationId])).toEqual([
      ['a', 'k1', 'o1'],
      ['a', 'k1', 'o2'],
      ['a', 'k2', 'o1'],
      ['b', 'k1', 'o1'],
    ]);
  });
});

function makePair(overrides: Partial<WaitingPair>): WaitingPair {
  return {
    matchKey: 'key',
    organizationId: 'org',
    printedName: 'printed',
    organizationName: 'organization',
    documentCount: 1,
    ...overrides,
  };
}
