import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['scheduled_tasks']);
  pgm.sql('ALTER TABLE scheduled_tasks ADD COLUMN locked_until timestamptz');
}
