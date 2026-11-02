import type { Reply } from '../delivery/reply.ts';
import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { clearPendingChoice } from '../identities/clear-pending-choice.ts';
import type { PendingChoice } from '../identities/pending-choice.ts';
import { formatVietnamDateTime } from '../workspaces/format-expiry.ts';
import { computeNextRun } from './compute-next-run.ts';
import type { ConfirmAction } from './confirm-reply.ts';
import { lockWorkspaceTasks } from './lock-workspace-tasks.ts';
import { readSchedule, SCHEDULE_COLUMNS, type ScheduleRow } from './schedule-columns.ts';
import { formatCancelledText, formatSavedText, RUN_TIME_PASSED_TEXT } from './schedule-texts.ts';

export type Confirmer = { identity: ChannelIdentity; userId: string; now: Date };

type DraftChoice = Extract<PendingChoice, { kind: 'draft_confirm' }>;

type OwnDraft = ScheduleRow & { id: string; title: string; membership_id: string };

export async function confirmDraft(
  transaction: Transaction,
  confirmer: Confirmer,
  choice: DraftChoice,
  action: ConfirmAction | null,
): Promise<Reply | null> {
  await clearPendingChoice(transaction, confirmer.identity);
  if (action === null) return null;
  await lockWorkspaceTasks(transaction, choice.workspaceId);
  const draft = await lockOwnDraft(transaction, confirmer.userId, choice);
  if (draft === null) return null;
  return action === 'save' ? saveDraft(transaction, draft, confirmer.now) : cancelDraft(transaction, draft);
}

function lockOwnDraft(transaction: Transaction, userId: string, choice: DraftChoice): Promise<OwnDraft | null> {
  return transaction
    .query<OwnDraft>(
      `SELECT task.id, task.title, ${SCHEDULE_COLUMNS}, membership.id AS membership_id
       FROM scheduled_tasks task
       JOIN memberships membership
         ON membership.workspace_id = task.workspace_id AND membership.user_id = task.created_by AND membership.role = 'admin'
       WHERE task.id = $1 AND task.created_by = $2 AND task.workspace_id = $3 AND task.status = 'draft'
       FOR UPDATE OF task`,
      [choice.taskId, userId, choice.workspaceId],
    )
    .then(([draft]) => draft ?? null);
}

async function saveDraft(transaction: Transaction, draft: OwnDraft, now: Date): Promise<Reply> {
  const firstRun = computeNextRun(readSchedule(draft), now);
  if (firstRun === null) return { text: RUN_TIME_PASSED_TEXT, adminMembershipId: draft.membership_id };
  await transaction.query(`UPDATE scheduled_tasks SET status = 'active', next_run_at = $2 WHERE id = $1`, [draft.id, firstRun]);
  return { text: formatSavedText(draft.title, formatVietnamDateTime(firstRun)), adminMembershipId: draft.membership_id };
}

async function cancelDraft(transaction: Transaction, draft: OwnDraft): Promise<Reply> {
  await transaction.query(`UPDATE scheduled_tasks SET status = 'cancelled' WHERE id = $1`, [draft.id]);
  return { text: formatCancelledText(draft.title), adminMembershipId: draft.membership_id };
}
