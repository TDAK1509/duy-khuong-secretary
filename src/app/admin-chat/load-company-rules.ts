import { scopeDatabase } from '../db/scoped-database.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import { listWorkspaceRules, type WorkspaceRule } from '../workspace-rules/list-workspace-rules.ts';

const UNKNOWN_AUTHOR = '(không rõ người lưu)';

export async function loadCompanyRules({ dependencies, sender }: IntakeContext): Promise<string> {
  const rules = await listWorkspaceRules(scopeDatabase(dependencies.database, { workspaceId: sender.workspaceId }), sender.workspaceId);
  return rules.map(describeRuleLine).join('\n');
}

function describeRuleLine({ rule, authorName }: WorkspaceRule): string {
  return `- ${authorName ?? UNKNOWN_AUTHOR}: ${rule}`;
}
