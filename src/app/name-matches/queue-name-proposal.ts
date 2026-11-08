import { listWorkspaceAdmins } from '../access/list-workspace-admins.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import { buildNameProposal, type NameProposal } from './build-name-proposal.ts';
import { listWaitingPairs } from './list-waiting-pairs.ts';

export async function queueNameProposalToAdmins(transaction: Transaction, context: IntakeContext): Promise<void> {
  const { sender, dependencies } = context;
  const proposal = await findNameProposal(transaction, sender.workspaceId);
  if (proposal === null) return;
  for (const admin of await listWorkspaceAdmins(transaction, sender.workspaceId)) {
    await enqueueText(transaction, {
      to: admin.recipient,
      adminMembershipId: admin.membershipId,
      requiresOpenWindow: true,
      text: proposal.text,
      maxTextLength: dependencies.channel.maxTextLength,
      availableAt: dependencies.clock.now(),
    });
  }
}

export async function findNameProposal(transaction: Transaction, workspaceId: string): Promise<NameProposal | null> {
  const waiting = await listWaitingPairs(transaction, workspaceId);
  return waiting.length === 0 ? null : buildNameProposal(waiting);
}
