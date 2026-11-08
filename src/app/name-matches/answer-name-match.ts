import { isCurrentWorkspaceAdmin } from '../access/is-current-admin.ts';
import type { Transaction } from '../db/transaction.ts';
import type { Reply } from '../delivery/reply.ts';
import { clearPendingChoice } from '../identities/clear-pending-choice.ts';
import type { NamePair, PendingChoice } from '../identities/pending-choice.ts';
import { NO_PENDING_CHOICE_TEXT } from '../processing/conversation-texts.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { insertRow } from '../documents/insert-row.ts';
import type { Chooser } from '../workspaces/switch-workspace.ts';

type NameMatchChoice = Extract<PendingChoice, { kind: 'name_match' }>;

export async function answerNameMatch(transaction: Transaction, chooser: Chooser, choice: NameMatchChoice, number: number): Promise<Reply> {
  await clearPendingChoice(transaction, chooser.identity);
  const { workspaceId } = choice;
  if (!(await isCurrentWorkspaceAdmin(transaction, { workspaceId, userId: chooser.userId }))) return { text: NO_PENDING_CHOICE_TEXT };
  const pair = choice.pairs[number - 1];
  if (pair === undefined) return { text: NO_PENDING_CHOICE_TEXT };
  return transaction.withScope({ workspaceId }, async () => {
    await lockWorkspaceRecords(transaction, workspaceId);
    return confirmPair(transaction, workspaceId, pair);
  });
}

async function confirmPair(transaction: Transaction, workspaceId: string, pair: NamePair): Promise<Reply> {
  const documentCount = await linkWaitingParties(transaction, workspaceId, pair);
  await insertRow(transaction, 'organization_aliases', {
    workspace_id: workspaceId,
    organization_id: pair.organizationId,
    printed_name: pair.printedName,
    match_key: pair.matchKey,
  });
  const [organization] = await transaction.query<{ name: string }>('SELECT name FROM organizations WHERE id = $1', [pair.organizationId]);
  return { text: `Đã xác nhận "${pair.printedName}" là "${organization?.name}" (${documentCount} giấy tờ).` };
}

async function linkWaitingParties(transaction: Transaction, workspaceId: string, pair: NamePair): Promise<number> {
  const linked = await transaction.query<{ document_id: string }>(
    `UPDATE document_parties SET organization_id = proposed_organization_id, proposed_organization_id = NULL
     WHERE workspace_id = $1 AND match_key = $2 AND proposed_organization_id = $3
     RETURNING document_id`,
    [workspaceId, pair.matchKey, pair.organizationId],
  );
  return new Set(linked.map((party) => party.document_id)).size;
}
