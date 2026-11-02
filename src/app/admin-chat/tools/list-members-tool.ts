import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { listMembers } from '../../workspaces/list-members.ts';

export async function runListMembers(database: Database, scope: AccessScope): Promise<string> {
  return JSON.stringify({ members: await listMembers(database, scope) });
}
