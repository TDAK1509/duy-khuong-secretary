import { isCurrentWorkspaceAdmin } from '../access/is-current-admin.ts';
import type { Transaction } from '../db/transaction.ts';
import type { Reply } from '../delivery/reply.ts';
import { clearPendingChoice } from '../identities/clear-pending-choice.ts';
import type { NamePair, PendingChoice } from '../identities/pending-choice.ts';
import { NO_PENDING_CHOICE_TEXT } from '../processing/conversation-texts.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { insertOrganization } from '../documents/insert-organization.ts';
import { insertRow } from '../documents/insert-row.ts';
import { buildNameMatchChoice } from './build-name-match-choice.ts';
import { findNameProposal } from './find-name-proposal.ts';
import type { Chooser } from '../workspaces/switch-workspace.ts';

const ALREADY_HANDLED_TEXT = 'Cặp tên này đã được xử lý. Không đổi gì.';
const KEPT_APART_TEXT = 'Đã lưu các tên này là bên riêng.';

type LinkedParty = { document_id: string };

type NameMatchChoice = Extract<PendingChoice, { kind: 'name_match' }>;

export async function answerNameMatch(transaction: Transaction, chooser: Chooser, choice: NameMatchChoice, number: number): Promise<Reply> {
  await clearPendingChoice(transaction, chooser.identity);
  const { workspaceId } = choice;
  if (!(await isCurrentWorkspaceAdmin(transaction, { workspaceId, userId: chooser.userId }))) return { text: NO_PENDING_CHOICE_TEXT };
  const pair = choice.pairs[number - 1];
  if (number !== 0 && pair === undefined) return { text: NO_PENDING_CHOICE_TEXT };
  const reply = await transaction.withScope({ workspaceId }, async () => {
    await lockWorkspaceRecords(transaction, workspaceId);
    return pair === undefined ? keepApart(transaction, workspaceId, choice.pairs) : confirmPair(transaction, workspaceId, pair);
  });
  return addNextProposal(transaction, workspaceId, reply);
}

async function addNextProposal(transaction: Transaction, workspaceId: string, reply: Reply): Promise<Reply> {
  const proposal = await findNameProposal(transaction, workspaceId);
  if (proposal === null) return reply;
  return { ...reply, followUpText: proposal.text, followUpChoice: buildNameMatchChoice(workspaceId, proposal) };
}

async function keepApart(transaction: Transaction, workspaceId: string, pairs: NamePair[]): Promise<Reply> {
  let partyCount = 0;
  for (const pair of pairs) partyCount += await createOrganizationForWaitingParties(transaction, workspaceId, pair);
  if (partyCount === 0) return { text: ALREADY_HANDLED_TEXT };
  logAppliedReply(workspaceId, partyCount);
  return { text: KEPT_APART_TEXT };
}

async function createOrganizationForWaitingParties(transaction: Transaction, workspaceId: string, pair: NamePair): Promise<number> {
  const [waiting] = await transaction.query<{ type: string }>(
    `SELECT type FROM document_parties
     WHERE workspace_id = $1 AND match_key = $2 AND proposed_organization_id IS NOT NULL
     ORDER BY created_at, id LIMIT 1`,
    [workspaceId, pair.matchKey],
  );
  if (waiting === undefined) return 0;
  const organizationId = await insertOrganization(transaction, workspaceId, { type: waiting.type, printedName: pair.printedName, matchKey: pair.matchKey });
  const linked = await transaction.query(
    `UPDATE document_parties SET organization_id = $3, proposed_organization_id = NULL
     WHERE workspace_id = $1 AND match_key = $2 AND proposed_organization_id IS NOT NULL
     RETURNING id`,
    [workspaceId, pair.matchKey, organizationId],
  );
  return linked.length;
}

function logAppliedReply(workspaceId: string, partyCount: number): void {
  console.log(`[name-match] workspace=${workspaceId} parties=${partyCount}`);
}

async function confirmPair(transaction: Transaction, workspaceId: string, pair: NamePair): Promise<Reply> {
  const linked = await linkWaitingParties(transaction, workspaceId, pair);
  if (linked.length === 0) return { text: ALREADY_HANDLED_TEXT };
  await insertRow(transaction, 'organization_aliases', {
    workspace_id: workspaceId,
    organization_id: pair.organizationId,
    printed_name: pair.printedName,
    match_key: pair.matchKey,
  });
  logAppliedReply(workspaceId, linked.length);
  const [organization] = await transaction.query<{ name: string }>('SELECT name FROM organizations WHERE id = $1', [pair.organizationId]);
  return { text: `Đã xác nhận "${pair.printedName}" là "${organization?.name}" (${countDocuments(linked)} giấy tờ).` };
}

async function linkWaitingParties(transaction: Transaction, workspaceId: string, pair: NamePair): Promise<LinkedParty[]> {
  return transaction.query<LinkedParty>(
    `UPDATE document_parties SET organization_id = proposed_organization_id, proposed_organization_id = NULL
     WHERE workspace_id = $1 AND match_key = $2 AND proposed_organization_id = $3
     RETURNING document_id`,
    [workspaceId, pair.matchKey, pair.organizationId],
  );
}

function countDocuments(parties: LinkedParty[]): number {
  return new Set(parties.map((party) => party.document_id)).size;
}
