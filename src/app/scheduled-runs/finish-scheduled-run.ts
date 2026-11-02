import { enqueueText } from '../delivery/enqueue-text.ts';
import { runInTransaction } from '../db/transaction.ts';
import type { ClaimedTask } from './claim-due-task.ts';
import type { ScheduledRunDependencies } from './run-due-tasks.ts';

type IdentityRow = { channel: string; account_id: string; external_user_id: string };

export async function finishScheduledRun(
  { database, clock, channel }: ScheduledRunDependencies,
  task: ClaimedTask,
  text: string,
): Promise<void> {
  await runInTransaction(database, async (transaction) => {
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
    });
  });
}

