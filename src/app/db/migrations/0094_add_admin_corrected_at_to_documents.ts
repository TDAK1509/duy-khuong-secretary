import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['documents']);
  pgm.sql('ALTER TABLE documents ADD COLUMN admin_corrected_at timestamptz');
}
