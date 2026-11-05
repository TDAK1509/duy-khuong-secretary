import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['outbound_messages']);
  pgm.sql('ALTER TABLE outbound_messages ADD COLUMN quote_message_id text');
  pgm.sql('ALTER TABLE outbound_messages ADD COLUMN fallback_photo_key text');
  pgm.sql(
    `ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_quote_is_on_text CHECK (kind = 'text' OR (quote_message_id IS NULL AND fallback_photo_key IS NULL))`,
  );
  pgm.sql(
    'ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_fallback_needs_quote CHECK (fallback_photo_key IS NULL OR quote_message_id IS NOT NULL)',
  );
}
