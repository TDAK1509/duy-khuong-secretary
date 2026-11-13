import type { Database } from '../db/transaction.ts';

export async function hasCredits(database: Database, workspaceId: string): Promise<boolean> {
  const { rows } = await database.query<{ has_credits: boolean }>(
    'SELECT credit_balance > 0 AS has_credits FROM workspaces WHERE id = $1',
    [workspaceId],
  );
  return rows[0]?.has_credits ?? false;
}
