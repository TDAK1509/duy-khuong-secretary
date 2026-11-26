import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['outbound_messages']);
  pgm.sql('ALTER TABLE outbound_messages ADD COLUMN external_message_id text');
  pgm.sql(`
    CREATE INDEX outbound_messages_external_message_id_idx
    ON outbound_messages (channel, account_id, external_user_id, external_message_id)
    WHERE external_message_id IS NOT NULL
  `);
}
