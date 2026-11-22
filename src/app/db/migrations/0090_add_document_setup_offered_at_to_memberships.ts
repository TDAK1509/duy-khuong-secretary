import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['memberships']);
  pgm.sql('ALTER TABLE memberships ADD COLUMN document_setup_offered_at timestamptz');
}
