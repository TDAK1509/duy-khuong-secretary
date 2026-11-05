import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['outbound_messages']);
  pgm.sql('ALTER TABLE outbound_messages DROP CONSTRAINT outbound_messages_check');
  pgm.sql(`ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_text_has_body CHECK (kind <> 'text' OR body IS NOT NULL)`);
  pgm.sql(`ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_template_has_no_body CHECK (kind <> 'template' OR body IS NULL)`);
}
