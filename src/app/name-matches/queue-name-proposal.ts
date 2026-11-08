import { listWorkspaceAdmins, type WorkspaceAdmin } from '../access/list-workspace-admins.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import { buildNameMatchChoice } from './build-name-match-choice.ts';
import type { NameProposal } from './build-name-proposal.ts';
import { findNameProposal } from './find-name-proposal.ts';

export async function queueNameProposalToAdmins(transaction: Transaction, context: IntakeContext): Promise<void> {
  const proposal = await findNameProposal(transaction, context.sender.workspaceId);
  if (proposal === null) return;
  for (const admin of await listWorkspaceAdmins(transaction, context.sender.workspaceId)) {
    await enqueueProposal(transaction, context, proposal, admin);
  }
}

export async function queueNameProposalToSender(transaction: Transaction, context: IntakeContext): Promise<void> {
  const { sender, event } = context;
  const proposal = await findNameProposal(transaction, sender.workspaceId);
  if (proposal === null) return;
  const recipient = { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId };
  await enqueueProposal(transaction, context, proposal, { membershipId: sender.membershipId, recipient });
}

async function enqueueProposal(transaction: Transaction, context: IntakeContext, proposal: NameProposal, admin: WorkspaceAdmin): Promise<void> {
  await enqueueText(transaction, {
    to: admin.recipient,
    adminMembershipId: admin.membershipId,
    requiresOpenWindow: true,
    text: proposal.text,
    offeredChoice: { choice: buildNameMatchChoice(context.sender.workspaceId, proposal), sourceEventId: context.event.id },
    maxTextLength: context.dependencies.channel.maxTextLength,
    availableAt: context.dependencies.clock.now(),
  });
}
