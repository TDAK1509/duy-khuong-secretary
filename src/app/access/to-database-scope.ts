import type { DatabaseScope } from '../db/transaction.ts';

type Caller = { workspaceId: string; userId: string; role: 'admin' | 'member' };

export function toDatabaseScope({ workspaceId, userId, role }: Caller): DatabaseScope {
  return role === 'member' ? { workspaceId, ownerUserId: userId } : { workspaceId };
}
