import { scopeDatabase } from '../db/scoped-database.ts';
import { runInTransaction, type Transaction } from '../db/transaction.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { ClaimedTask } from './claim-due-task.ts';
import type { ScheduledRunDependencies } from './run-due-tasks.ts';

type IdentityRow = { channel: string; account_id: string; external_user_id: string };

export async function finishScheduledRun(
  dependencies: ScheduledRunDependencies,
  task: ClaimedTask,
  text: string,
): Promise<void> {
  const database = scopeDatabase(dependencies.database, { workspaceId: task.workspaceId });
  await runInTransaction(database, async (transaction) => {
    await storeResultMessage(transaction, task, text);
    await enqueueResult(transaction, dependencies, task, text);
  });
}

async function storeResultMessage(transaction: Transaction, task: ClaimedTask, text: string): Promise<void> {
  await transaction.query(`INSERT INTO messages (workspace_id, user_id, author, text) VALUES ($1, $2, 'bot', $3)`, [
    task.workspaceId,
    task.createdBy,
    text,
  ]);
}

async function enqueueResult(
  transaction: Transaction,
  { channel, clock }: ScheduledRunDependencies,
  task: ClaimedTask,
  text: string,
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
    scheduledTaskId: task.id,
  });
}
