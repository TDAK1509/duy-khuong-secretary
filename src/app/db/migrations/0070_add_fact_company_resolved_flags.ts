import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['facts']);
  pgm.sql('ALTER TABLE facts ADD COLUMN pickup_resolved boolean NOT NULL DEFAULT false');
  pgm.sql('ALTER TABLE facts ADD COLUMN dropoff_resolved boolean NOT NULL DEFAULT false');
  pgm.sql('ALTER TABLE facts ADD COLUMN customer_resolved boolean NOT NULL DEFAULT false');
}
