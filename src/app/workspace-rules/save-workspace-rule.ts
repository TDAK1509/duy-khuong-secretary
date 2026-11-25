import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { LIST_RULES_SQL, toWorkspaceRule, type WorkspaceRule, type WorkspaceRuleRow } from './list-workspace-rules.ts';

export const MAX_RULES = 50;
export const MAX_RULE_LENGTH = 1000;

export type NewWorkspaceRule = { workspaceId: string; authorUserId: string; rule: string };

export type SaveRuleResult = { action: 'saved'; ruleId: string } | { action: 'full'; rules: WorkspaceRule[] };

const INSERT_RULE_SQL = 'INSERT INTO workspace_rules (workspace_id, author_user_id, rule) VALUES ($1, $2, $3) RETURNING id';

export function saveWorkspaceRule(database: Database, newRule: NewWorkspaceRule): Promise<SaveRuleResult> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRules(transaction, newRule.workspaceId);
    const rules = (await transaction.query<WorkspaceRuleRow>(LIST_RULES_SQL, [newRule.workspaceId])).map(toWorkspaceRule);
    if (rules.length >= MAX_RULES) return { action: 'full', rules };
    return { action: 'saved', ruleId: await insertRule(transaction, newRule) };
  });
}

async function lockWorkspaceRules(transaction: Transaction, workspaceId: string): Promise<void> {
  await transaction.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`workspace-rules:${workspaceId}`]);
}

async function insertRule(transaction: Transaction, { workspaceId, authorUserId, rule }: NewWorkspaceRule): Promise<string> {
  const [row] = await transaction.query<{ id: string }>(INSERT_RULE_SQL, [workspaceId, authorUserId, rule]);
  if (row === undefined) throw new Error('inserting a workspace rule returned no row');
  return row.id;
}
