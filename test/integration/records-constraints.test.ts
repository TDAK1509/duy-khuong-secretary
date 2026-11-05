import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

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

  it('accepts a category outside the old list', async () => {
    await expect(insertRecord({ category: 'phiếu cân', maintenanceItem: null, vehiclePlate: null })).resolves.toBeDefined();
  });

  it('refuses a blank category', async () => {
    await expect(insertRecord({ category: '  ', maintenanceItem: null, vehiclePlate: null })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('accepts a maintenance item whatever the category', async () => {
    await expect(
      insertRecord({ category: 'thay phụ tùng', maintenanceItem: 'lốp', vehiclePlate: '29C12345' }),
    ).resolves.toBeDefined();
  });

  it('refuses a blank maintenance item', async () => {
    await expect(insertRecord({ category: 'bảo dưỡng', maintenanceItem: ' ', vehiclePlate: '29C12345' })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('refuses a maintenance item without a plate', async () => {
    await expect(insertRecord({ category: 'sửa chữa xe', maintenanceItem: 'lốp', vehiclePlate: null })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('refuses a blank document title', async () => {
    await expect(
      insertRecord({ category: 'kiểm định xe', maintenanceItem: null, vehiclePlate: null, documentTitle: '  ' }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses a record whose workspace differs from its message', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải Thử');

    await expect(
      insertRecord({ category: 'đổ xăng dầu', maintenanceItem: null, vehiclePlate: null, workspaceId: otherWorkspaceId }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('refuses two records with one item index', async () => {
    await insertRecord({ category: 'đổ xăng dầu', maintenanceItem: null, vehiclePlate: null });

    await expect(insertRecord({ category: 'đổ xăng dầu', maintenanceItem: null, vehiclePlate: null })).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
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
    documentTitle?: string | null;
    workspaceId?: string;
    itemIndex?: number;
  };

  function insertRecord(record: NewRecordRow): Promise<unknown> {
    const quote = (value: string | null) => (value === null ? 'NULL' : `'${value}'`);
    return database.query(
      `INSERT INTO records (workspace_id, user_id, message_id, item_index, sender_name, category, maintenance_item,
         vehicle_plate, document_title, summary, read_by)
       VALUES ('${record.workspaceId ?? workspaceId}', '${userId}', '${messageId}', ${record.itemIndex ?? 0}, 'Hùng',
         '${record.category}', ${quote(record.maintenanceItem)}, ${quote(record.vehiclePlate)},
         ${quote(record.documentTitle ?? null)}, 'x', 'cheap_pair')`,
    );
  }
});
