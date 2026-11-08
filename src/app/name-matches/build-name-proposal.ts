export type WaitingPair = {
  matchKey: string;
  organizationId: string;
  printedName: string;
  organizationName: string;
  documentCount: number;
};

export type NameProposal = { listed: WaitingPair[]; text: string };

const MAX_LISTED_PAIRS = 9;
const HEADER = 'Tên mới đọc được gần giống tên đã lưu:';
const INSTRUCTION =
  'Trả lời số để xác nhận là cùng một bên. Trả lời 0 nếu không có cặp nào đúng. Khi chưa xác nhận, các giấy tờ này chưa được tính theo tên đó.';

export function buildNameProposal(waiting: WaitingPair[]): NameProposal {
  const sorted = [...waiting].sort(compareByDocumentCount);
  const listed = sorted.slice(0, MAX_LISTED_PAIRS);
  const lines = listed.map((pair, index) => `${index + 1}. "${pair.printedName}" → "${pair.organizationName}" (${pair.documentCount} giấy tờ)`);
  return { listed, text: [HEADER, ...lines, INSTRUCTION, ...describeRemainder(sorted.length - listed.length)].join('\n') };
}

function describeRemainder(remainingCount: number): string[] {
  return remainingCount > 0 ? [`Còn ${remainingCount} cặp nữa sẽ gửi sau khi bạn trả lời.`] : [];
}

function compareByDocumentCount(first: WaitingPair, second: WaitingPair): number {
  return (
    second.documentCount - first.documentCount ||
    compareText(first.printedName, second.printedName) ||
    compareText(first.matchKey, second.matchKey) ||
    compareText(first.organizationId, second.organizationId)
  );
}

function compareText(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}
