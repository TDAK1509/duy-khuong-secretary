import type { Database } from '../db/transaction.ts';
import { isUuid } from './is-uuid.ts';

export async function findWorkspaceName(database: Database, workspaceId: string): Promise<string | null> {
  if (!isUuid(workspaceId)) return null;
  const { rows } = await database.query<{ name: string }>('SELECT name FROM workspaces WHERE id = $1', [workspaceId]);
  return rows[0]?.name ?? null;
}
