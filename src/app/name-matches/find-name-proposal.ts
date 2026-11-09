import type { Transaction } from '../db/transaction.ts';
import { buildNameProposal, type NameProposal } from './build-name-proposal.ts';
import { listWaitingPairs } from './list-waiting-pairs.ts';

export async function findNameProposal(transaction: Transaction, workspaceId: string): Promise<NameProposal | null> {
  const waiting = await listWaitingPairs(transaction, workspaceId);
  return waiting.length === 0 ? null : buildNameProposal(waiting);
}
