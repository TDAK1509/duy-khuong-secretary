import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['facts']);
  pgm.sql(`ALTER TABLE facts ADD CONSTRAINT facts_customer_match_key_check CHECK (customer_match_key IS NULL OR customer_match_key ~ '^[a-z0-9]+$') NOT VALID`);
  pgm.sql('ALTER TABLE facts ADD CONSTRAINT facts_customer_pair_check CHECK ((customer_name IS NULL) = (customer_match_key IS NULL)) NOT VALID');
}
