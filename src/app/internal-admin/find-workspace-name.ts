import type { Database } from '../db/transaction.ts';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findWorkspaceName(database: Database, workspaceId: string): Promise<string | null> {
  if (!UUID_SHAPE.test(workspaceId)) return null;
  const { rows } = await database.query<{ name: string }>('SELECT name FROM workspaces WHERE id = $1', [workspaceId]);
  return rows[0]?.name ?? null;
}
