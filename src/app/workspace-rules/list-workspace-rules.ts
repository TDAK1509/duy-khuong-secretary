import type { Database } from '../db/transaction.ts';

export type WorkspaceRule = { id: string; rule: string; authorName: string | null };

export type WorkspaceRuleRow = { id: string; rule: string; author_name: string | null };

export const LIST_RULES_SQL = `
  SELECT workspace_rule.id, workspace_rule.rule, author.display_name AS author_name
  FROM workspace_rules workspace_rule
  LEFT JOIN memberships author ON author.workspace_id = workspace_rule.workspace_id AND author.user_id = workspace_rule.author_user_id
  WHERE workspace_rule.workspace_id = $1
  ORDER BY workspace_rule.created_at, workspace_rule.id
`;

export async function listWorkspaceRules(database: Database, workspaceId: string): Promise<WorkspaceRule[]> {
  const { rows } = await database.query<WorkspaceRuleRow>(LIST_RULES_SQL, [workspaceId]);
  return rows.map(toWorkspaceRule);
}

export function toWorkspaceRule({ id, rule, author_name: authorName }: WorkspaceRuleRow): WorkspaceRule {
  return { id, rule, authorName };
}
