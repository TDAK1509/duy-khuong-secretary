import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';
import type { Transaction } from '../db/transaction.ts';
import { splitText } from './split-text.ts';

export type TextToEnqueue = {
  to: ChannelRecipient;
  text: string;
  maxTextLength: number;
  availableAt: Date;
  adminMembershipId?: string;
};

export async function enqueueText(transaction: Transaction, message: TextToEnqueue): Promise<void> {
  for (const part of splitText(message.text, message.maxTextLength)) {
    await transaction.query(
      `INSERT INTO outbound_messages (channel, account_id, external_user_id, kind, body, admin_membership_id, available_at)
       VALUES ($1, $2, $3, 'text', $4, $5, $6)`,
      [message.to.channel, message.to.accountId, message.to.externalUserId, part, message.adminMembershipId ?? null, message.availableAt],
    );
  }
}
