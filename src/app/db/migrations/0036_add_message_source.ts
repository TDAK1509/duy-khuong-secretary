import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['messages']);
  pgm.sql(`ALTER TABLE messages ADD COLUMN source text NOT NULL DEFAULT 'zalo' CHECK (source IN ('zalo', 'mcp'))`);
  pgm.sql('ALTER TABLE messages DROP CONSTRAINT messages_check1');
  pgm.sql(`
    ALTER TABLE messages ADD CONSTRAINT messages_user_event_check
      CHECK (author = 'bot' OR source = 'mcp' OR (inbound_event_id IS NOT NULL AND event_part IS NOT NULL))
  `);
  pgm.sql(`
    ALTER TABLE messages ADD CONSTRAINT messages_zalo_event_check
      CHECK (source = 'zalo' OR (inbound_event_id IS NULL AND event_part IS NULL))
  `);
}
