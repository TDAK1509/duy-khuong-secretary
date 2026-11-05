import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['messages', 'records']);
  pgm.sql('ALTER TABLE records DROP COLUMN read_by');
  pgm.sql('ALTER TABLE messages DROP COLUMN code_choice');
}
