import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';
import type { Transaction } from '../db/transaction.ts';

export type ImageToEnqueue = {
  to: ChannelRecipient;
  photoKey: string;
  text?: string;
  availableAt: Date;
  adminMembershipId?: string;
  requiresOpenWindow?: boolean;
};

export async function enqueueImage(transaction: Transaction, message: ImageToEnqueue): Promise<void> {
  await transaction.query(
    `INSERT INTO outbound_messages (channel, account_id, external_user_id, kind, photo_key, body, admin_membership_id, requires_open_window, available_at)
     VALUES ($1, $2, $3, 'image', $4, $5, $6, $7, $8)`,
    [
      message.to.channel,
      message.to.accountId,
      message.to.externalUserId,
      message.photoKey,
      message.text ?? null,
      message.adminMembershipId ?? null,
      message.requiresOpenWindow ?? false,
      message.availableAt,
    ],
  );
}
