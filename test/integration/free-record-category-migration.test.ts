import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrationCommand } from '../../src/bootstrap/migrate.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const migrationsDirectory = new URL('../../src/app/db/migrations/', import.meta.url);

const RESTORE_THE_SHAPE_BEFORE_THE_MIGRATION = `
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
    await insertRecordRow(database, { workspaceId, userId, senderName: 'Hùng', category: oldCategory });

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

  async function migrate(): Promise<void> {
    const lines: string[] = [];
    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: database.url },
      { directory: migrationsDirectory, log: (line) => lines.push(line) },
    );
    expect(lines).toEqual(['[migrate] applied: 0030_free_record_category']);
    expect(exitCode).toBe(0);
  }
});
