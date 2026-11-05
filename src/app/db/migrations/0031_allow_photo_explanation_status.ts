import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['messages']);
  pgm.sql('ALTER TABLE messages DROP CONSTRAINT messages_submission_status_check');
  pgm.sql(`
    ALTER TABLE messages ADD CONSTRAINT messages_submission_status_check
      CHECK (submission_status IN
        ('pending', 'accepted', 'duplicate', 'unresolved', 'failed', 'needs_explanation', 'asked_again'))
  `);
}
