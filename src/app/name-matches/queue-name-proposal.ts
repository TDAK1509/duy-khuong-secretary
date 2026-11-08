import { listWorkspaceAdmins, type WorkspaceAdmin } from '../access/list-workspace-admins.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueText, type OfferedChoice } from '../delivery/enqueue-text.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import { buildNameProposal, type NameProposal } from './build-name-proposal.ts';
import { listWaitingPairs } from './list-waiting-pairs.ts';

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

export async function findNameProposal(transaction: Transaction, workspaceId: string): Promise<NameProposal | null> {
  const waiting = await listWaitingPairs(transaction, workspaceId);
  return waiting.length === 0 ? null : buildNameProposal(waiting);
}

async function enqueueProposal(transaction: Transaction, context: IntakeContext, proposal: NameProposal, admin: WorkspaceAdmin): Promise<void> {
  await enqueueText(transaction, {
    to: admin.recipient,
    adminMembershipId: admin.membershipId,
    requiresOpenWindow: true,
    text: proposal.text,
    offeredChoice: buildProposalOffer(context.sender.workspaceId, proposal, context.event.id),
    maxTextLength: context.dependencies.channel.maxTextLength,
    availableAt: context.dependencies.clock.now(),
  });
}

function buildProposalOffer(workspaceId: string, proposal: NameProposal, sourceEventId: string): OfferedChoice {
  const pairs = proposal.listed.map(({ matchKey, organizationId, printedName }) => ({ matchKey, organizationId, printedName }));
  return { choice: { kind: 'name_match', workspaceId, pairs }, sourceEventId };
}
