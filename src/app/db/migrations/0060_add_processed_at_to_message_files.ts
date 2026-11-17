import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['message_files']);
  pgm.sql('ALTER TABLE message_files ADD COLUMN processed_at timestamptz');
}
