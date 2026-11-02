import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';
import type { Transaction } from '../db/transaction.ts';
import { toStoredChoice, type PendingChoice } from '../identities/pending-choice.ts';
import { splitText } from './split-text.ts';

export type OfferedChoice = { choice: PendingChoice; sourceEventId: string };

export type TextToEnqueue = {
  to: ChannelRecipient;
  text: string;
  maxTextLength: number;
  availableAt: Date;
  adminMembershipId?: string;
  scheduledTaskId?: string;
  offeredChoice?: OfferedChoice;
};

export async function enqueueText(transaction: Transaction, message: TextToEnqueue): Promise<void> {
  const parts = splitText(message.text, message.maxTextLength);
  for (const [index, part] of parts.entries()) {
    const isLastPart = index === parts.length - 1;
    await transaction.query(
      `INSERT INTO outbound_messages
         (channel, account_id, external_user_id, kind, body, admin_membership_id, available_at, scheduled_task_id, offered_choice)
       VALUES ($1, $2, $3, 'text', $4, $5, $6, $7,
         $8::jsonb || jsonb_build_object('source_received_at', (SELECT received_at FROM inbound_events WHERE id = $9)))`,
      [
        message.to.channel,
        message.to.accountId,
        message.to.externalUserId,
        part,
        message.adminMembershipId ?? null,
        message.availableAt,
        message.scheduledTaskId ?? null,
        isLastPart && message.offeredChoice ? JSON.stringify(toStoredChoice(message.offeredChoice.choice)) : null,
        isLastPart ? (message.offeredChoice?.sourceEventId ?? null) : null,
      ],
    );
  }
}
