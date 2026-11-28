import { scopeDatabase } from '../db/scoped-database.ts';
import { listCompanyNoteLines } from '../facts/list-company-notes.ts';
import type { IntakeContext } from '../intake/intake-context.ts';

export async function loadCompanyRules({ dependencies, sender }: IntakeContext): Promise<string> {
  const lines = await listCompanyNoteLines(scopeDatabase(dependencies.database, { workspaceId: sender.workspaceId }), sender.workspaceId);
  return lines.join('\n');
}
