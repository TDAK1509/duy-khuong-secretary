import type { Transaction } from '../db/transaction.ts';
import type { ClaimedMessage } from './claimed-message.ts';

const MAX_TITLE_LENGTH = 30;
const PHOTO_NOTICE_TITLE = 'Ảnh mới trong nhóm';

export async function enqueueReportReadyTemplate(
  transaction: Transaction,
  message: ClaimedMessage,
  { templateId, now }: { templateId: string; now: Date },
): Promise<void> {
  const title = await readTitle(transaction, message);
  await transaction.query(
    `INSERT INTO outbound_messages
       (channel, account_id, external_user_id, kind, template_id, template_params, admin_membership_id, available_at)
     SELECT $1::text, $2::text, $3::text, 'template', $4::text, $5::jsonb, $6::uuid, $7::timestamptz
     WHERE NOT EXISTS (
       SELECT 1 FROM outbound_messages earlier
       JOIN channel_identities identity
         ON identity.channel = earlier.channel
        AND identity.account_id = earlier.account_id
        AND identity.external_user_id = earlier.external_user_id
       WHERE earlier.kind = 'template' AND earlier.channel = $1 AND earlier.account_id = $2 AND earlier.external_user_id = $3
         AND earlier.created_at > identity.last_inbound_at
     )`,
    [
      message.to.channel,
      message.to.accountId,
      message.to.externalUserId,
      templateId,
      JSON.stringify({ task_title: cutTitle(title) }),
      message.adminMembershipId,
      now,
    ],
  );
}

async function readTitle(transaction: Transaction, message: ClaimedMessage): Promise<string> {
  if (message.scheduledTaskId === null) return PHOTO_NOTICE_TITLE;
  const [task] = await transaction.query<{ title: string }>('SELECT title FROM scheduled_tasks WHERE id = $1', [
    message.scheduledTaskId,
  ]);
  return task?.title ?? '';
}

function cutTitle(title: string): string {
  const characters = Array.from(title);
  return characters.length <= MAX_TITLE_LENGTH ? title : `${characters.slice(0, MAX_TITLE_LENGTH).join('')}…`;
}
