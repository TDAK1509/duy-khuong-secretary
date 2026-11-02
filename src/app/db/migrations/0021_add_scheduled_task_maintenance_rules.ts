import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['scheduled_tasks']);
  pgm.sql(`ALTER TABLE scheduled_tasks ADD COLUMN maintenance_rules jsonb NOT NULL DEFAULT '[]'`);
  pgm.sql(`
    ALTER TABLE scheduled_tasks
      ADD CONSTRAINT scheduled_tasks_maintenance_rules_is_array
      CHECK (jsonb_typeof(maintenance_rules) = 'array') NOT VALID
  `);
}
