import type { Transaction } from '../db/transaction.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { FileClaim } from './file-claims.ts';

export type FileReply = { claim: FileClaim; text: string; now: Date; maxTextLength: number };

type FileRecipient = { channel: string; accountId: string; externalUserId: string; membershipId: string; externalEventId: string; receivedAt: Date };

const LATE_REPLY_MS = 30 * 60 * 1000;

const RECIPIENT_QUERY = `
  SELECT event.channel, event.account_id AS "accountId", event.external_user_id AS "externalUserId",
         membership.id AS "membershipId", event.external_event_id AS "externalEventId", event.received_at AS "receivedAt"
  FROM messages message
  JOIN inbound_events event ON event.id = message.inbound_event_id
  JOIN memberships membership ON membership.user_id = message.user_id AND membership.workspace_id = message.workspace_id
  WHERE message.id = $1`;

export async function enqueueFileReply(transaction: Transaction, { claim, text, now, maxTextLength }: FileReply): Promise<boolean> {
  const [recipient] = await transaction.query<FileRecipient>(RECIPIENT_QUERY, [claim.messageId]);
  if (recipient === undefined) return false;
  await enqueueText(transaction, {
    to: { channel: recipient.channel, accountId: recipient.accountId, externalUserId: recipient.externalUserId },
    text: addLatePrefix(text, recipient.receivedAt, now),
    maxTextLength,
    availableAt: now,
    adminMembershipId: recipient.membershipId,
    quote: { messageId: recipient.externalEventId },
  });
  return true;
}

function addLatePrefix(text: string, receivedAt: Date, now: Date): string {
  if (now.getTime() - new Date(receivedAt).getTime() <= LATE_REPLY_MS) return text;
  return `Kết quả cho file gửi lúc ${formatVietnamTime(new Date(receivedAt))}: ${text}`;
}

function formatVietnamTime(moment: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(moment).map((part) => [part.type, part.value]));
  return `${parts['hour']}:${parts['minute']} ${parts['day']}/${parts['month']}`;
}
