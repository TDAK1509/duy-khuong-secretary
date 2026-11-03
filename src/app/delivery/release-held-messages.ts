import type { Transaction } from '../db/transaction.ts';
import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';
import { enqueueText } from './enqueue-text.ts';

export type Release = { to: ChannelRecipient; maxTextLength: number; now: Date };

export async function releaseHeldMessages(transaction: Transaction, { to, maxTextLength, now }: Release): Promise<void> {
  const held = await transaction.query<{ id: string }>(
    `SELECT id FROM outbound_messages
     WHERE channel = $1 AND account_id = $2 AND external_user_id = $3 AND status = 'held'
     ORDER BY seq FOR UPDATE`,
    [to.channel, to.accountId, to.externalUserId],
  );
  if (held.length === 0) return;
  await enqueueText(transaction, { to, text: describeRelease(held.length), maxTextLength, availableAt: now });
  await copyAsQueued(transaction, held.map(({ id }) => id), now);
  await transaction.query('DELETE FROM outbound_messages WHERE id = ANY($1::uuid[])', [held.map(({ id }) => id)]);
}

function describeRelease(count: number): string {
  return `Bạn có ${count} tin nhắn chưa nhận được. Trợ lý gửi ngay sau đây.`;
}

async function copyAsQueued(transaction: Transaction, ids: string[], now: Date): Promise<void> {
  await transaction.query(
    `INSERT INTO outbound_messages
       (channel, account_id, external_user_id, kind, body, photo_key, admin_membership_id, scheduled_task_id, requires_open_window, available_at)
     SELECT channel, account_id, external_user_id, kind, body, photo_key, admin_membership_id, scheduled_task_id, requires_open_window, $2
     FROM outbound_messages WHERE id = ANY($1::uuid[]) ORDER BY seq`,
    [ids, now],
  );
}
