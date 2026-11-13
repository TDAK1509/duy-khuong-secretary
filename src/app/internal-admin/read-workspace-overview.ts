import type { Database } from '../db/transaction.ts';

export type WorkspaceOverview = { id: string; name: string; balance: string };

export async function readWorkspaceOverview(database: Database): Promise<WorkspaceOverview[]> {
  const { rows } = await database.query<{ id: string; name: string; credit_balance: string }>(
    'SELECT id, name, credit_balance FROM workspaces ORDER BY name, id',
  );
  return rows.map((row) => ({ id: row.id, name: row.name, balance: row.credit_balance }));
}
