import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql(`
    CREATE INDEX CONCURRENTLY outbound_messages_sending_idx
    ON outbound_messages (locked_until)
    WHERE status = 'sending'
  `);
}
