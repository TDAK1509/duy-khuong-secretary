import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql('ALTER TABLE scheduled_tasks VALIDATE CONSTRAINT scheduled_tasks_maintenance_rules_is_array');
}
