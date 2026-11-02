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
};

export async function insertOutboundMessage(database: TemporaryDatabase, message: NewOutboundMessage): Promise<string> {
  const [row] = await database.query<{ id: string }>(
    `INSERT INTO outbound_messages
       (channel, account_id, external_user_id, kind, body, photo_key, admin_membership_id, status, attempts, available_at, locked_until, sent_at)
     VALUES ('zalo-oa', ${literal(message.accountId ?? 'oa-1')}, ${literal(message.externalUserId ?? 'zu-hung')},
       ${message.photoKey ? "'image', NULL" : `'text', ${literal(message.body ?? 'chào')}`}, ${message.photoKey ? literal(message.photoKey) : 'NULL'}, ${message.adminMembershipId ? literal(message.adminMembershipId) : 'NULL'},
       ${literal(message.status ?? 'queued')}, ${message.attempts ?? 0}, ${timestamp(message.availableAt ?? new Date(0))},
       ${timestamp(message.lockedUntil ?? null)}, ${timestamp(message.sentAt ?? null)})
     RETURNING id`,
  );
  if (!row) throw new Error('outbound message not inserted');
  return row.id;
}
