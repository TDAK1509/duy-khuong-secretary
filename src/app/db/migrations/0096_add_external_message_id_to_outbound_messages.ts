import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['outbound_messages']);
  pgm.sql('ALTER TABLE outbound_messages ADD COLUMN external_message_id text');
}
