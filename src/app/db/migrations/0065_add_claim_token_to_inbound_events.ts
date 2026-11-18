import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['inbound_events']);
  pgm.sql('ALTER TABLE inbound_events ADD COLUMN claim_token uuid');
}
