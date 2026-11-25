import type { Database } from '../db/transaction.ts';

export async function deleteWorkspaceRule(database: Database, workspaceId: string, ruleId: string): Promise<string | null> {
  const { rows } = await database.query<{ rule: string }>('DELETE FROM workspace_rules WHERE id = $1 AND workspace_id = $2 RETURNING rule', [ruleId, workspaceId]);
  return rows[0]?.rule ?? null;
}
