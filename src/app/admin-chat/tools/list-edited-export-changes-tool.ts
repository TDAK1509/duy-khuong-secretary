import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction, type Database } from '../../db/transaction.ts';
import { groupChanges, type ChangeGroup } from '../../export-reviews/group-changes.ts';
import { listNewestReviewChanges } from '../../export-reviews/review-changes.ts';

export async function runListEditedExportChanges(database: Database, scope: AccessScope): Promise<string> {
  const changes = await runInTransaction(database, (transaction) => listNewestReviewChanges(transaction, scope.workspaceId));
  return JSON.stringify({ changes: groupChanges(changes).map(describeGroup) });
}

function describeGroup({ changes }: ChangeGroup): Record<string, unknown> {
  const [first] = changes as [ChangeGroup['changes'][number]];
  return {
    change_id: first.id,
    rows: changes.map((change) => change.rowNumber),
    column: first.columnName,
    old_value: first.before,
    new_value: first.after,
    source: first.source,
    suggested_cause: first.suggestedCause,
    candidate_actions: first.candidates,
    status: first.status,
  };
}
