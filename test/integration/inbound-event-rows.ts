import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type EventRow = {
  id: string;
  status: string;
  attempts: number;
  available_at: Date;
  locked_until: Date | null;
  last_error: string | null;
  processed_at: Date | null;
};

export type NewInboundEvent = {
  kind?: 'text' | 'images';
  externalUserId?: string;
  accountId?: string;
  externalEventId?: string;
  sentAt?: string;
  status?: string;
  attempts?: number;
  availableAt?: Date;
  lockedUntil?: Date | null;
  receivedAt?: Date;
};

const FIRST_RECEIVED_AT = new Date('2026-11-02T09:00:00+07:00');

let eventCounter = 0;

export async function insertInboundEvent(database: TemporaryDatabase, event: NewInboundEvent): Promise<string> {
  eventCounter += 1;
  const kind = event.kind ?? 'text';
  const sentAt = event.sentAt ?? '2026-11-02T10:00:00+07:00';
  const payload = JSON.stringify(
    kind === 'text' ? { text: 'chào', sent_at: sentAt } : { image_urls: ['https://z.test/1.jpg'], caption: null, sent_at: sentAt },
  );
  const [row] = await database.query<{ id: string }>(
    `INSERT INTO inbound_events
       (channel, account_id, external_event_id, external_user_id, kind, payload, status, attempts, available_at, locked_until, received_at)
     VALUES ('zalo-oa', ${literal(event.accountId ?? 'oa-1')}, ${literal(event.externalEventId ?? `m${eventCounter}`)}, ${literal(event.externalUserId ?? 'zu-hung')}, ${literal(kind)},
       ${literal(payload)}::jsonb, ${literal(event.status ?? 'queued')}, ${event.attempts ?? 0},
       ${timestamp(event.availableAt ?? new Date(0))}, ${timestamp(event.lockedUntil ?? null)},
       ${timestamp(event.receivedAt ?? new Date(FIRST_RECEIVED_AT.getTime() + eventCounter * 1000))})
     RETURNING id`,
  );
  if (!row) throw new Error('event not inserted');
  return row.id;
}
