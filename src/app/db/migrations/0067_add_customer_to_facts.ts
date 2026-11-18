import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['facts']);
  pgm.sql('ALTER TABLE facts ADD COLUMN customer_name text');
  pgm.sql('ALTER TABLE facts ADD COLUMN customer_match_key text');
}
