export const FACT_READERS = ['admins_and_member', 'admins', 'author'] as const;

export type FactReaders = (typeof FACT_READERS)[number];

export type FactAccess = { readers: FactReaders; authorUserId: string | null; memberUserId: string };

export type FactReader = { userId: string; role: 'admin' | 'member' };

export function mayRead(fact: FactAccess, reader: FactReader): boolean {
  switch (fact.readers) {
    case 'author':
      return reader.userId === fact.authorUserId;
    case 'admins':
      return reader.role === 'admin';
    case 'admins_and_member':
      return reader.role === 'admin' || reader.userId === fact.memberUserId;
  }
}

export function mayFeedReader(fact: FactAccess, sender: FactReader): boolean {
  return fact.readers !== 'author' && mayRead(fact, sender);
}
