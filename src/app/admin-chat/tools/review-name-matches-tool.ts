import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction } from '../../db/transaction.ts';
import { listWaitingPairs } from '../../name-matches/list-waiting-pairs.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

export async function runReviewNameMatches({ database, nameReview }: AdminToolDependencies, scope: AccessScope): Promise<string> {
  const waiting = await runInTransaction(database, (transaction) => listWaitingPairs(transaction, scope.workspaceId));
  nameReview.request();
  return JSON.stringify({ ok: true, waiting_pairs: waiting.length });
}
