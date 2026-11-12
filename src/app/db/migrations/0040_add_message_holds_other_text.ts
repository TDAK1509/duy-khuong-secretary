import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['messages']);
  pgm.sql('ALTER TABLE messages ADD COLUMN holds_other_text boolean NOT NULL DEFAULT true');
}
