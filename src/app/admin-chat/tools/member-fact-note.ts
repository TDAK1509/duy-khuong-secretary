import { mayRead, type FactAccess } from '../../memory/fact-readers.ts';

export function buildFactNote(memberName: string, fact: FactAccess): string {
  return `${describeReaders(fact, memberName)} ${describeUse(fact, memberName)}`;
}

function describeReaders({ readers }: FactAccess, memberName: string): string {
  switch (readers) {
    case 'admins_and_member':
      return `Các quản lý và ${memberName} xem được thông tin này.`;
    case 'admins':
      return 'Chỉ các quản lý xem được thông tin này.';
    case 'author':
      return 'Chỉ bạn xem được thông tin này.';
  }
}

function describeUse(fact: FactAccess, memberName: string): string {
  const memberAsReader = { userId: fact.memberUserId, role: 'member' } as const;
  const verb = mayRead(fact, memberAsReader) ? 'dùng' : 'không dùng';
  return `Hệ thống ${verb} thông tin này khi đọc ảnh và tin nhắn ${memberName} gửi.`;
}
