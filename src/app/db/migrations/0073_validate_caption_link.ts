import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['inbound_events']);
  pgm.sql('ALTER TABLE inbound_events VALIDATE CONSTRAINT inbound_events_caption_for_event_id_fkey');
}
