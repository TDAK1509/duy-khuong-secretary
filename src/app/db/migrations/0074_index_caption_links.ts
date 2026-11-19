import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql(`
    CREATE UNIQUE INDEX CONCURRENTLY inbound_events_caption_for_event_id_key
    ON inbound_events (caption_for_event_id)
    WHERE caption_for_event_id IS NOT NULL
  `);
}
