import { isCurrentAdmin } from '../access/is-current-admin.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import { runInTransaction, type Transaction } from '../db/transaction.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import { computeNextRun } from '../schedules/compute-next-run.ts';
import type { ClaimedTask } from './claim-due-task.ts';
import type { TaskCreator } from './find-task-creator.ts';
import type { ScheduledRunDependencies } from './run-due-tasks.ts';
import { NOTHING_TO_REPORT } from './scheduled-run-texts.ts';
import { turnOffTaskIn } from './turn-off-task.ts';

type IdentityRow = { channel: string; account_id: string; external_user_id: string };

export async function finishScheduledRun(
  dependencies: ScheduledRunDependencies,
  task: ClaimedTask,
  creator: TaskCreator,
  text: string,
): Promise<void> {
  const database = scopeDatabase(dependencies.database, { workspaceId: task.workspaceId });
  await runInTransaction(database, async (transaction) => {
    if (!(await ownsClaim(transaction, task))) return;
    if (!(await isCurrentAdmin(transaction, creator.membershipId))) return turnOffTaskIn(transaction, task);
    if (text.trim() !== NOTHING_TO_REPORT) await deliverResult(transaction, dependencies, task, creator, text);
    await moveToNextRun(transaction, task, dependencies.clock.now());
  });
}

async function ownsClaim(transaction: Transaction, task: ClaimedTask): Promise<boolean> {
  const rows = await transaction.query(
    `SELECT 1 FROM scheduled_tasks WHERE id = $1 AND status = 'active' AND next_run_at = $2::timestamptz FOR UPDATE`,
    [task.id, task.claimedNextRunAt],
  );
  return rows.length > 0;
}

async function deliverResult(
  transaction: Transaction,
  dependencies: ScheduledRunDependencies,
  task: ClaimedTask,
  creator: TaskCreator,
  text: string,
): Promise<void> {
  await transaction.query(`INSERT INTO messages (workspace_id, user_id, author, text) VALUES ($1, $2, 'bot', $3)`, [
    task.workspaceId,
    task.createdBy,
    text,
  ]);
  await enqueueResult(transaction, dependencies, { task, creator, text });
}

async function enqueueResult(
  transaction: Transaction,
  { channel, clock }: ScheduledRunDependencies,
  { task, creator, text }: { task: ClaimedTask; creator: TaskCreator; text: string },
): Promise<void> {
  const [identity] = await transaction.query<IdentityRow>(
    'SELECT channel, account_id, external_user_id FROM channel_identities WHERE user_id = $1',
    [task.createdBy],
  );
  if (!identity) return;
  await enqueueText(transaction, {
    to: { channel: identity.channel, accountId: identity.account_id, externalUserId: identity.external_user_id },
    text,
    maxTextLength: channel.maxTextLength,
    availableAt: clock.now(),
    adminMembershipId: creator.membershipId,
    scheduledTaskId: task.id,
  });
}

async function moveToNextRun(transaction: Transaction, task: ClaimedTask, now: Date): Promise<void> {
  await transaction.query('UPDATE scheduled_tasks SET next_run_at = $2, last_run_at = $3, locked_until = NULL WHERE id = $1', [
    task.id,
    computeNextRun(task.schedule, now),
    now,
  ]);
}
