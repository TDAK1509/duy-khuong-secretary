import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['inbound_events']);
  pgm.sql('ALTER TABLE inbound_events ADD COLUMN caption_for_event_id uuid');
  pgm.sql(
    'ALTER TABLE inbound_events ADD CONSTRAINT inbound_events_caption_for_event_id_fkey FOREIGN KEY (caption_for_event_id) REFERENCES inbound_events (id) ON DELETE SET NULL NOT VALID',
  );
}
