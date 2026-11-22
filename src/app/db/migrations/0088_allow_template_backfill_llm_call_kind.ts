import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const OPERATOR_KINDS = `'operator_reread', 'operator_backfill'`;

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['llm_calls']);
  pgm.sql('ALTER TABLE llm_calls DROP CONSTRAINT llm_calls_kind_check');
  pgm.sql(`
    ALTER TABLE llm_calls
      ADD CONSTRAINT llm_calls_kind_check
      CHECK (kind IN ('photo_read', 'text_read', 'chat_answer', 'scheduled_run', 'chatgpt_text_save', 'template_backfill', ${OPERATOR_KINDS})) NOT VALID
  `);
}
