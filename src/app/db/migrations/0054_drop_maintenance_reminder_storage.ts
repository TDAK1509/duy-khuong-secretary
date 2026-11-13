import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['maintenance_notifications', 'scheduled_tasks']);
  pgm.sql('DROP TABLE maintenance_notifications');
  pgm.sql('ALTER TABLE scheduled_tasks DROP COLUMN maintenance_rules');
}
