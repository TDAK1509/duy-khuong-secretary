import type { NewInboundEvent } from './inbound-event-rows.ts';
import { insertChatMessage } from './message-rows.ts';
import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type NewRecordRow = {
  workspaceId: string;
  userId: string;
  senderName: string;
  category?: string;
  documentTitle?: string | null;
  maintenanceItem?: string | null;
  vehiclePlate?: string | null;
  documentNumber?: string | null;
  occurredOn?: string | null;
  amountVnd?: number | null;
  identifiers?: string[];
  summary?: string;
  details?: { label: string; value: string; number?: unknown; unit?: unknown }[];
  createdAt?: Date;
  savedAt?: Date;
  hasPhoto?: boolean;
  imageKey?: string;
  messageId?: string;
  itemIndex?: number;
  messageText?: string | null;
  event?: NewInboundEvent;
};

const DEFAULT_CREATED_AT = new Date('2026-10-31T10:00:00+07:00');

export async function insertRecordRow(database: TemporaryDatabase, row: NewRecordRow): Promise<string> {
  const createdAt = row.createdAt ?? DEFAULT_CREATED_AT;
  const messageId = row.messageId ?? (await insertChatMessage(database, {
    workspaceId: row.workspaceId,
    userId: row.userId,
    author: 'user',
    text: row.messageText === undefined ? 'tin nhắn' : row.messageText,
    imageKey: row.imageKey ?? (row.hasPhoto ? `${row.workspaceId}/photo.jpg` : null),
    createdAt,
    event: row.event,
  }));
  const category = row.category ?? 'đổ xăng dầu';
  const maintenanceItem = row.maintenanceItem ?? (category === 'bảo dưỡng' ? 'lốp' : null);
  const vehiclePlate = row.vehiclePlate ?? (maintenanceItem === null ? null : '29C12345');
  const [inserted] = await database.query<{ id: string }>(
    `INSERT INTO records
       (workspace_id, user_id, message_id, item_index, sender_name, category, document_title, maintenance_item, vehicle_plate,
        document_number, occurred_on, amount_vnd, identifiers, summary, details, created_at)
     VALUES (${literal(row.workspaceId)}, ${literal(row.userId)}, ${literal(messageId)}, ${row.itemIndex ?? 0}, ${literal(row.senderName)},
       ${literal(category)}, ${nullable(row.documentTitle ?? null)}, ${nullable(maintenanceItem)}, ${nullable(vehiclePlate)}, ${nullable(row.documentNumber ?? null)},
       ${nullable(row.occurredOn ?? null)}, ${row.amountVnd ?? 'NULL'},
       ARRAY[${(row.identifiers ?? []).map(literal).join(',')}]::text[], ${literal(row.summary ?? 'Mục')},
       ${literal(JSON.stringify(row.details ?? []))}::jsonb, ${timestamp(row.savedAt ?? createdAt)})
     RETURNING id`,
  );
  if (!inserted) throw new Error('record not inserted');
  return inserted.id;
}

function nullable(value: string | null): string {
  return value === null ? 'NULL' : literal(value);
}

export type NewRecordRows = {
  workspaceId: string;
  userId: string;
  senderName: string;
  label: string;
  count: number;
  firstCreatedAt: Date;
};

export async function insertRecordRows(database: TemporaryDatabase, rows: NewRecordRows): Promise<void> {
  await database.query(
    `WITH saved_messages AS (
       INSERT INTO messages (workspace_id, user_id, author, text, created_at)
       SELECT ${literal(rows.workspaceId)}, ${literal(rows.userId)}, 'bot', 'tin nhắn',
         ${timestamp(rows.firstCreatedAt)}::timestamptz + number * interval '1 second'
       FROM generate_series(1, ${rows.count}) AS number
       RETURNING id, created_at
     )
     INSERT INTO records (workspace_id, user_id, message_id, item_index, sender_name, category, summary, details, created_at)
     SELECT ${literal(rows.workspaceId)}, ${literal(rows.userId)}, id, 0, ${literal(rows.senderName)}, 'đổ xăng dầu', 'Mục',
       ${literal(JSON.stringify([{ label: rows.label, value: 'giá trị' }]))}::jsonb, created_at
     FROM saved_messages`,
  );
}
