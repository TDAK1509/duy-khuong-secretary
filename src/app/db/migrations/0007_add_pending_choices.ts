import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['channel_identities', 'outbound_messages']);
  pgm.sql('ALTER TABLE channel_identities ADD COLUMN pending_choice jsonb');
  pgm.sql('ALTER TABLE outbound_messages ADD COLUMN offered_choice jsonb');
}
