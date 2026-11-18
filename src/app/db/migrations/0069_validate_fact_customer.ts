import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['facts']);
  pgm.sql('ALTER TABLE facts VALIDATE CONSTRAINT facts_customer_match_key_check');
  pgm.sql('ALTER TABLE facts VALIDATE CONSTRAINT facts_customer_pair_check');
}
