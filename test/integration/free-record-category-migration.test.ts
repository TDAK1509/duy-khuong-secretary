import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrationCommand } from '../../src/bootstrap/migrate.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertChatMessage } from './message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const migrationsDirectory = new URL('../../src/app/db/migrations/', import.meta.url);

const RESTORE_THE_SHAPE_BEFORE_THE_MIGRATION = `
  DELETE FROM pgmigrations WHERE name = '0043_remove_name_proposals';
  DROP TABLE merged_names;
  ALTER TABLE document_parties DROP COLUMN known_name;
  DELETE FROM pgmigrations WHERE name = '0042_merge_close_names';
  DROP TABLE user_memories;
  DELETE FROM pgmigrations WHERE name = '0041_create_user_memories';
  ALTER TABLE messages DROP COLUMN holds_other_text;
  DELETE FROM pgmigrations WHERE name = '0040_add_message_holds_other_text';
  DELETE FROM pgmigrations WHERE name = '0039_split_documents_by_plate';
  DROP TABLE document_reads;
  DELETE FROM pgmigrations WHERE name = '0038_create_document_reads';
  DROP TABLE document_parties, document_lines, document_sources, documents, meanings, organization_aliases, organizations;
  DELETE FROM pgmigrations WHERE name = '0037_create_document_tables';
  ALTER TABLE messages DROP CONSTRAINT messages_zalo_event_check;
  ALTER TABLE messages DROP CONSTRAINT messages_user_event_check;
  ALTER TABLE messages ADD CONSTRAINT messages_check1
    CHECK (author = 'bot' OR (inbound_event_id IS NOT NULL AND event_part IS NOT NULL));
  ALTER TABLE messages DROP COLUMN source;
  DELETE FROM pgmigrations WHERE name = '0036_add_message_source';
  DROP TABLE chatgpt_connections;
  DELETE FROM pgmigrations WHERE name = '0035_create_chatgpt_connections';
  DROP TABLE chatgpt_login_codes;
  DROP TABLE chatgpt_sign_ins;
  DELETE FROM pgmigrations WHERE name = '0034_create_chatgpt_sign_in_tables';
  ALTER TABLE messages ADD COLUMN code_choice jsonb;
  ALTER TABLE records ADD COLUMN read_by text;
  DELETE FROM pgmigrations WHERE name = '0033_drop_two_reader_columns';
  ALTER TABLE messages DROP COLUMN code_choice;
  DELETE FROM pgmigrations WHERE name = '0032_add_message_code_choice';
  ALTER TABLE messages DROP CONSTRAINT messages_submission_status_check;
  ALTER TABLE messages ADD CONSTRAINT messages_submission_status_check
    CHECK (submission_status IN ('pending', 'accepted', 'duplicate', 'unresolved', 'failed'));
  DELETE FROM pgmigrations WHERE name = '0031_allow_photo_explanation_status';
  ALTER TABLE records DROP CONSTRAINT records_category_not_blank;
  ALTER TABLE records DROP CONSTRAINT records_maintenance_item_not_blank;
  ALTER TABLE records DROP CONSTRAINT records_maintenance_item_needs_plate;
  ALTER TABLE records DROP COLUMN document_title;
  ALTER TABLE records ADD CONSTRAINT records_category_check
    CHECK (category IN ('fuel', 'toll', 'delivery_pickup', 'delivery_dropoff', 'maintenance', 'certificate', 'other'));
  ALTER TABLE records ADD CONSTRAINT records_check CHECK ((category = 'maintenance') = (maintenance_item IS NOT NULL));
  ALTER TABLE records ADD CONSTRAINT records_check1 CHECK (category <> 'maintenance' OR vehicle_plate IS NOT NULL);
  DROP INDEX records_maintenance_idx;
  CREATE INDEX records_maintenance_idx ON records (workspace_id, vehicle_plate, maintenance_item, created_at)
    WHERE category = 'maintenance';
  DELETE FROM pgmigrations WHERE name = '0030_free_record_category'
`;

describe('the migration that frees the record categories', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    await database.query(RESTORE_THE_SHAPE_BEFORE_THE_MIGRATION);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
  });

  afterEach(async () => {
    await database.drop();
  });

  it.each([
    ['fuel', 'đổ xăng dầu'],
    ['toll', 'phí cầu đường'],
    ['delivery_pickup', 'nhận hàng'],
    ['delivery_dropoff', 'giao hàng'],
    ['maintenance', 'bảo dưỡng'],
    ['certificate', 'giấy chứng nhận'],
    ['other', 'khác'],
  ])('turns the old category %s into %s', async (oldCategory, newCategory) => {
    await insertRecordOfTheOldShape(oldCategory);

    await migrate();

    expect(await database.query('SELECT category, document_title FROM records')).toEqual([
      { category: newCategory, document_title: null },
    ]);
  });

  it('indexes the records that have a maintenance item', async () => {
    await migrate();

    const [index] = await database.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'records_maintenance_idx'`,
    );

    expect(index?.indexdef).toContain('WHERE (maintenance_item IS NOT NULL)');
  });

  async function insertRecordOfTheOldShape(category: string): Promise<void> {
    const messageId = await insertChatMessage(database, {
      workspaceId,
      userId,
      author: 'user',
      text: 'tin nhắn',
      createdAt: new Date('2026-10-31T10:00:00+07:00'),
    });
    const isMaintenance = category === 'maintenance';
    await database.query(
      `INSERT INTO records (workspace_id, user_id, message_id, item_index, sender_name, category, maintenance_item,
         vehicle_plate, summary, read_by)
       VALUES ('${workspaceId}', '${userId}', '${messageId}', 0, 'Hùng', '${category}',
         ${isMaintenance ? `'lốp'` : 'NULL'}, ${isMaintenance ? `'29C12345'` : 'NULL'}, 'Mục', 'cheap_pair')`,
    );
  }

  async function migrate(): Promise<void> {
    const lines: string[] = [];
    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: migrationsDirectory, log: (line) => lines.push(line) },
    );
    expect(lines).toEqual([
      '[migrate] applied: 0030_free_record_category, 0031_allow_photo_explanation_status, 0032_add_message_code_choice, 0033_drop_two_reader_columns, 0034_create_chatgpt_sign_in_tables, 0035_create_chatgpt_connections, 0036_add_message_source, 0037_create_document_tables, 0038_create_document_reads, 0039_split_documents_by_plate, 0040_add_message_holds_other_text, 0041_create_user_memories, 0042_merge_close_names, 0043_remove_name_proposals',
    ]);
    expect(exitCode).toBe(0);
  }
});
