export type WaitingPair = {
  matchKey: string;
  organizationId: string;
  printedName: string;
  organizationName: string;
  documentCount: number;
};

export type NameProposal = { listed: WaitingPair[]; text: string };

const HEADER = 'Tên mới đọc được gần giống tên đã lưu:';
const INSTRUCTION =
  'Trả lời số để xác nhận là cùng một bên. Trả lời 0 nếu không có cặp nào đúng. Khi chưa xác nhận, các giấy tờ này chưa được tính theo tên đó.';

export function buildNameProposal(waiting: WaitingPair[]): NameProposal {
  const listed = [...waiting].sort(compareByDocumentCount);
  const lines = listed.map((pair, index) => `${index + 1}. "${pair.printedName}" → "${pair.organizationName}" (${pair.documentCount} giấy tờ)`);
  return { listed, text: [HEADER, ...lines, INSTRUCTION].join('\n') };
}

function compareByDocumentCount(first: WaitingPair, second: WaitingPair): number {
  return second.documentCount - first.documentCount;
}
