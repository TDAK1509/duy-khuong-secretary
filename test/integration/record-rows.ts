import { insertChatMessage } from './message-rows.ts';
import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type NewRecordRow = {
  workspaceId: string;
  userId: string;
  senderName: string;
  category?: string;
  maintenanceItem?: string | null;
  vehiclePlate?: string | null;
  documentNumber?: string | null;
  occurredOn?: string | null;
  amountVnd?: number | null;
  identifiers?: string[];
  summary?: string;
  details?: { label: string; value: string }[];
  createdAt?: Date;
  savedAt?: Date;
  hasPhoto?: boolean;
};

const DEFAULT_CREATED_AT = new Date('2026-10-31T10:00:00+07:00');

export async function insertRecordRow(database: TemporaryDatabase, row: NewRecordRow): Promise<string> {
  const createdAt = row.createdAt ?? DEFAULT_CREATED_AT;
  const messageId = await insertChatMessage(database, {
    workspaceId: row.workspaceId,
    userId: row.userId,
    author: 'user',
    text: 'tin nhắn',
    imageKey: row.hasPhoto ? `${row.workspaceId}/photo.jpg` : null,
    createdAt,
  });
  const category = row.category ?? 'fuel';
  const maintenanceItem = category === 'maintenance' ? (row.maintenanceItem ?? 'lốp') : null;
  const vehiclePlate = category === 'maintenance' ? (row.vehiclePlate ?? '29C12345') : (row.vehiclePlate ?? null);
  const [inserted] = await database.query<{ id: string }>(
    `INSERT INTO records
       (workspace_id, user_id, message_id, item_index, sender_name, category, maintenance_item, vehicle_plate,
        document_number, occurred_on, amount_vnd, identifiers, summary, details, read_by, created_at)
     VALUES (${literal(row.workspaceId)}, ${literal(row.userId)}, ${literal(messageId)}, 0, ${literal(row.senderName)},
       ${literal(category)}, ${nullable(maintenanceItem)}, ${nullable(vehiclePlate)}, ${nullable(row.documentNumber ?? null)},
       ${nullable(row.occurredOn ?? null)}, ${row.amountVnd ?? 'NULL'},
       ARRAY[${(row.identifiers ?? []).map(literal).join(',')}]::text[], ${literal(row.summary ?? 'Mục')},
       ${literal(JSON.stringify(row.details ?? []))}::jsonb, 'cheap_pair', ${timestamp(row.savedAt ?? createdAt)})
     RETURNING id`,
  );
  if (!inserted) throw new Error('record not inserted');
  return inserted.id;
}

function nullable(value: string | null): string {
  return value === null ? 'NULL' : literal(value);
}
