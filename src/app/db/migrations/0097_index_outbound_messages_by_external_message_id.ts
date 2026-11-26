import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql(`
    CREATE INDEX CONCURRENTLY outbound_messages_external_message_id_idx
    ON outbound_messages (channel, account_id, external_user_id, external_message_id)
    WHERE external_message_id IS NOT NULL
  `);
}
