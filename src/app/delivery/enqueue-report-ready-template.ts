import type { Transaction } from '../db/transaction.ts';
import type { ClaimedMessage } from './claimed-message.ts';

const MAX_TITLE_LENGTH = 30;

export async function enqueueReportReadyTemplate(
  transaction: Transaction,
  message: ClaimedMessage,
  { templateId, now }: { templateId: string; now: Date },
): Promise<void> {
  const [task] = await transaction.query<{ title: string }>('SELECT title FROM scheduled_tasks WHERE id = $1', [
    message.scheduledTaskId,
  ]);
  await transaction.query(
    `INSERT INTO outbound_messages
       (channel, account_id, external_user_id, kind, template_id, template_params, admin_membership_id, available_at)
     VALUES ($1, $2, $3, 'template', $4, $5::jsonb, $6, $7)`,
    [
      message.to.channel,
      message.to.accountId,
      message.to.externalUserId,
      templateId,
      JSON.stringify({ task_title: cutTitle(task?.title ?? '') }),
      message.adminMembershipId,
      now,
    ],
  );
}

function cutTitle(title: string): string {
  const characters = Array.from(title);
  return characters.length <= MAX_TITLE_LENGTH ? title : `${characters.slice(0, MAX_TITLE_LENGTH).join('')}…`;
}
