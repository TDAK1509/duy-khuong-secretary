import { z } from 'zod';
import type { Transaction } from '../db/transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';
import type { Finished, Stages } from './stages.ts';

const payloadSchema = z.object({ sent_at: z.iso.datetime({ offset: true }) });

export async function recordSenderIdentity(event: ClaimedEvent, stages: Stages): Promise<Finished> {
  const sentAt = new Date(payloadSchema.parse(event.payload).sent_at);
  return stages.finishEvent((transaction) => saveIdentity(transaction, event, sentAt));
}

async function saveIdentity(transaction: Transaction, event: ClaimedEvent, sentAt: Date): Promise<void> {
  await transaction.query(
    `INSERT INTO channel_identities (channel, account_id, external_user_id, last_inbound_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel, account_id, external_user_id) DO UPDATE SET last_inbound_at = EXCLUDED.last_inbound_at`,
    [event.channel, event.accountId, event.externalUserId, sentAt],
  );
}
