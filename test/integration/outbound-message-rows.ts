import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type OutboundRow = {
  id: string;
  status: string;
  attempts: number;
  available_at: Date;
  locked_until: Date | null;
  last_error: string | null;
  sent_at: Date | null;
};

export type NewOutboundMessage = {
  externalUserId?: string;
  accountId?: string;
  body?: string;
  photoKey?: string;
  status?: string;
  attempts?: number;
  availableAt?: Date;
  lockedUntil?: Date | null;
  sentAt?: Date | null;
  adminMembershipId?: string | null;
  scheduledTaskId?: string | null;
  requiresOpenWindow?: boolean;
  templateId?: string;
  quoteMessageId?: string;
  fallbackPhotoKey?: string;
  createdAt?: Date;
};

export async function insertOutboundMessage(database: TemporaryDatabase, message: NewOutboundMessage): Promise<string> {
  const [row] = await database.query<{ id: string }>(
    `INSERT INTO outbound_messages
       (channel, account_id, external_user_id, kind, body, photo_key, template_id, admin_membership_id, scheduled_task_id, requires_open_window, quote_message_id, fallback_photo_key, status, attempts, available_at, locked_until, sent_at, created_at)
     VALUES ('zalo-oa', ${literal(message.accountId ?? 'oa-1')}, ${literal(message.externalUserId ?? 'zu-hung')},
       ${describeContent(message)}, ${message.adminMembershipId ? literal(message.adminMembershipId) : 'NULL'}, ${message.scheduledTaskId ? literal(message.scheduledTaskId) : 'NULL'}, ${message.requiresOpenWindow ?? false},
       ${message.quoteMessageId ? literal(message.quoteMessageId) : 'NULL'}, ${message.fallbackPhotoKey ? literal(message.fallbackPhotoKey) : 'NULL'},
       ${literal(message.status ?? 'queued')}, ${message.attempts ?? 0}, ${timestamp(message.availableAt ?? new Date(0))},
       ${timestamp(message.lockedUntil ?? null)}, ${timestamp(message.sentAt ?? null)}, ${message.createdAt ? timestamp(message.createdAt) : 'now()'})
     RETURNING id`,
  );
  if (!row) throw new Error('outbound message not inserted');
  return row.id;
}

function describeContent(message: NewOutboundMessage): string {
  if (message.templateId) return `'template', NULL, NULL, ${literal(message.templateId)}`;
  if (message.photoKey) return `'image', ${message.body ? literal(message.body) : 'NULL'}, ${literal(message.photoKey)}, NULL`;
  return `'text', ${literal(message.body ?? 'chào')}, NULL, NULL`;
}
