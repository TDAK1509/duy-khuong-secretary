import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { FencedRun } from './backfill-claims.ts';
import { formatBackfillDone, formatBackfillStopped } from './backfill-texts.ts';

export type BackfillEnding = { status: 'done' } | { status: 'stopped'; stopReason: string };

export type BackfillResult = { workspaceId: string; requestedByUserId: string | null; run: FencedRun; ending: BackfillEnding; now: Date; maxTextLength: number };

type ResultRecipient = { membershipId: string; to: ChannelRecipient };

type RecipientRow = { membership_id: string; channel: string; account_id: string; external_user_id: string };

const FIND_RECIPIENT_SQL = `
  SELECT membership.id AS membership_id, identity.channel, identity.account_id, identity.external_user_id
  FROM memberships membership
  JOIN channel_identities identity ON identity.user_id = membership.user_id
  WHERE membership.workspace_id = $1 AND membership.role = 'admin'
  ORDER BY (membership.user_id IS NOT DISTINCT FROM $2::uuid) DESC, membership.created_at, membership.id, identity.last_inbound_at DESC, identity.id
  LIMIT 1`;

export async function enqueueBackfillResult(transaction: Transaction, result: BackfillResult): Promise<void> {
  const recipient = await findResultRecipient(transaction, result);
  if (recipient === null) {
    console.log(`[template-backfill] no admin to tell workspace=${result.workspaceId}`);
    return;
  }
  await enqueueText(transaction, {
    to: recipient.to,
    adminMembershipId: recipient.membershipId,
    requiresOpenWindow: true,
    text: describeResult(result),
    maxTextLength: result.maxTextLength,
    availableAt: result.now,
  });
}

async function findResultRecipient(transaction: Transaction, { workspaceId, requestedByUserId }: BackfillResult): Promise<ResultRecipient | null> {
  const [row] = await transaction.query<RecipientRow>(FIND_RECIPIENT_SQL, [workspaceId, requestedByUserId]);
  if (row === undefined) return null;
  return { membershipId: row.membership_id, to: { channel: row.channel, accountId: row.account_id, externalUserId: row.external_user_id } };
}

function describeResult({ run, ending }: BackfillResult): string {
  const counts = { updated: run.updatedCount, unmatched: run.unmatchedCount, skipped: run.skippedCount, failed: run.failedCount };
  const summary = { templateName: run.templateName, total: run.total, processed: run.nextIndex, counts };
  return ending.status === 'done' ? formatBackfillDone(summary) : formatBackfillStopped(summary, ending.stopReason);
}
