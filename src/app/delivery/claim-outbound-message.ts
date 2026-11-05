import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import type { ClaimedMessage, MessageContent } from './claimed-message.ts';

const LOCK_MS = 2 * 60 * 1000;
const THROTTLE_WINDOW_MS = 60 * 1000;
const CLAIM_LOCK_KEY = 80_001;
const CALLS_PER_IMAGE = 2;

type ClaimedRow = {
  id: string;
  channel: string;
  account_id: string;
  external_user_id: string;
  kind: 'text' | 'image' | 'template';
  body: string | null;
  photo_key: string | null;
  quote_message_id: string | null;
  fallback_photo_key: string | null;
  template_id: string | null;
  template_params: Record<string, string> | null;
  admin_membership_id: string | null;
  scheduled_task_id: string | null;
  requires_open_window: boolean;
  attempts: number;
};

export async function claimOutboundMessage(
  database: Database,
  now: Date,
  maxPerMinute: number,
): Promise<ClaimedMessage | null> {
  const rows = await runInTransaction(database, async (transaction) => {
    await transaction.query('SELECT pg_advisory_xact_lock($1)', [CLAIM_LOCK_KEY]);
    return claimNextRow(transaction, now, maxPerMinute);
  });
  const [row] = rows;
  return row ? describeClaim(row) : null;
}

function claimNextRow(transaction: Transaction, now: Date, maxPerMinute: number): Promise<ClaimedRow[]> {
  return transaction.query<ClaimedRow>(
    `WITH candidate AS (
       SELECT id FROM outbound_messages
       WHERE status = 'queued' AND kind IN ('text', 'image', 'template') AND available_at <= $1
         AND NOT EXISTS (
           SELECT 1 FROM outbound_messages earlier
           WHERE earlier.channel = outbound_messages.channel
             AND earlier.account_id = outbound_messages.account_id
             AND earlier.external_user_id = outbound_messages.external_user_id
             AND earlier.status IN ('queued', 'sending')
             AND earlier.seq < outbound_messages.seq
         )
         AND (SELECT coalesce(sum(${callsOf('recent.kind')}), 0) FROM outbound_messages recent WHERE recent.sent_at > $3 OR recent.status = 'sending')
           + ${callsOf('outbound_messages.kind')} <= $4
       ORDER BY seq
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE outbound_messages
     SET status = 'sending', locked_until = $2, attempts = attempts + 1
     FROM candidate
     WHERE outbound_messages.id = candidate.id
     RETURNING outbound_messages.id, channel, account_id, external_user_id, kind, body, photo_key, quote_message_id, fallback_photo_key, template_id, template_params, admin_membership_id, scheduled_task_id, requires_open_window, attempts`,
    [now, new Date(now.getTime() + LOCK_MS), new Date(now.getTime() - THROTTLE_WINDOW_MS), maxPerMinute],
  );
}

function callsOf(kindColumn: string): string {
  return `(CASE ${kindColumn} WHEN 'image' THEN ${CALLS_PER_IMAGE} ELSE 1 END)`;
}

function describeClaim(row: ClaimedRow): ClaimedMessage {
  return {
    id: row.id,
    to: { channel: row.channel, accountId: row.account_id, externalUserId: row.external_user_id },
    content: describeContent(row),
    adminMembershipId: row.admin_membership_id,
    scheduledTaskId: row.scheduled_task_id,
    requiresOpenWindow: row.requires_open_window,
    attempts: row.attempts,
  };
}

function describeContent(row: ClaimedRow): MessageContent {
  if (row.kind === 'image' && row.photo_key !== null) return { kind: 'image', photoKey: row.photo_key, text: row.body ?? undefined };
  if (row.kind === 'text' && row.body !== null) return describeTextContent(row, row.body);
  if (row.kind === 'template' && row.template_id !== null) {
    return { kind: 'template', templateId: row.template_id, params: row.template_params ?? {} };
  }
  throw new Error(`outbound message ${row.id} has no content for its kind`);
}

function describeTextContent(row: ClaimedRow, body: string): MessageContent {
  if (row.quote_message_id === null) return { kind: 'text', body };
  return { kind: 'text', body, quote: { messageId: row.quote_message_id, fallbackPhotoKey: row.fallback_photo_key ?? undefined } };
}
