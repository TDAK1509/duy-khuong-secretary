import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['records']);
  dropOldChecks(pgm);
  addFreeCategoryChecks(pgm);
  pgm.sql(`
    ALTER TABLE records ADD COLUMN document_title text
      CONSTRAINT records_document_title_not_blank CHECK (document_title IS NULL OR btrim(document_title) <> '')
  `);
  indexRecordsByMaintenanceItem(pgm);
  mapOldCategoriesToVietnamese(pgm);
}

function dropOldChecks(pgm: MigrationBuilder): void {
  pgm.sql('ALTER TABLE records DROP CONSTRAINT records_category_check');
  pgm.sql('ALTER TABLE records DROP CONSTRAINT records_check');
  pgm.sql('ALTER TABLE records DROP CONSTRAINT records_check1');
}

function addFreeCategoryChecks(pgm: MigrationBuilder): void {
  pgm.sql(`ALTER TABLE records ADD CONSTRAINT records_category_not_blank CHECK (btrim(category) <> '')`);
  pgm.sql(`
    ALTER TABLE records ADD CONSTRAINT records_maintenance_item_not_blank
      CHECK (maintenance_item IS NULL OR btrim(maintenance_item) <> '')
  `);
  pgm.sql(`
    ALTER TABLE records ADD CONSTRAINT records_maintenance_item_needs_plate
      CHECK (maintenance_item IS NULL OR vehicle_plate IS NOT NULL)
  `);
}

function indexRecordsByMaintenanceItem(pgm: MigrationBuilder): void {
  pgm.sql('DROP INDEX records_maintenance_idx');
  pgm.sql(`
    CREATE INDEX records_maintenance_idx ON records (workspace_id, vehicle_plate, maintenance_item, created_at)
    WHERE maintenance_item IS NOT NULL
  `);
}

function mapOldCategoriesToVietnamese(pgm: MigrationBuilder): void {
  pgm.sql(`
    UPDATE records SET category = CASE category
      WHEN 'fuel' THEN 'đổ xăng dầu'
      WHEN 'toll' THEN 'phí cầu đường'
      WHEN 'delivery_pickup' THEN 'nhận hàng'
      WHEN 'delivery_dropoff' THEN 'giao hàng'
      WHEN 'maintenance' THEN 'bảo dưỡng'
      WHEN 'certificate' THEN 'giấy chứng nhận'
      ELSE 'khác'
    END
  `);
}
