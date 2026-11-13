import { mayFeedReader, type FactAccess, type FactReader } from '../../memory/fact-readers.ts';

type Subject = { displayName: string; role: FactReader['role'] };

export function buildFactNote(subject: Subject, fact: FactAccess): string {
  return `${describeReaders(fact, subject.displayName)} ${describeUse(fact, subject)}`;
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

function describeUse(fact: FactAccess, subject: Subject): string {
  const verb = mayFeedReader(fact, { userId: fact.memberUserId, role: subject.role }) ? 'dùng' : 'không dùng';
  return `Hệ thống ${verb} thông tin này khi đọc ảnh và tin nhắn ${subject.displayName} gửi.`;
}
