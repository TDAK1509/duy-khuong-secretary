import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const CHECK_VIOLATION = '23514';

describe('the records table', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let userId: string;
  let messageId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    messageId = await insertUserMessage();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('refuses a maintenance record without a maintenance item', async () => {
    await expect(insertRecord({ category: 'maintenance', maintenanceItem: null, vehiclePlate: '29C12345' })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('refuses a fuel record with a maintenance item', async () => {
    await expect(insertRecord({ category: 'fuel', maintenanceItem: 'dầu máy', vehiclePlate: null })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  async function insertUserMessage(): Promise<string> {
    const eventId = await insertInboundEvent(database, { externalUserId: 'zu-hung' });
    const [row] = await database.query<{ id: string }>(
      `INSERT INTO messages (workspace_id, user_id, author, text, inbound_event_id, event_part)
       VALUES ('${workspaceId}', '${userId}', 'user', 'chào', '${eventId}', 0) RETURNING id`,
    );
    if (!row) throw new Error('message not inserted');
    return row.id;
  }

  type NewRecordRow = {
    category: string;
    maintenanceItem: string | null;
    vehiclePlate: string | null;
    workspaceId?: string;
    itemIndex?: number;
  };

  function insertRecord(record: NewRecordRow): Promise<unknown> {
    const quote = (value: string | null) => (value === null ? 'NULL' : `'${value}'`);
    return database.query(
      `INSERT INTO records (workspace_id, user_id, message_id, item_index, sender_name, category, maintenance_item,
         vehicle_plate, summary, read_by)
       VALUES ('${record.workspaceId ?? workspaceId}', '${userId}', '${messageId}', ${record.itemIndex ?? 0}, 'Hùng',
         '${record.category}', ${quote(record.maintenanceItem)}, ${quote(record.vehiclePlate)}, 'x', 'cheap_pair')`,
    );
  }
});
