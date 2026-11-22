import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['llm_calls']);
  pgm.sql('ALTER TABLE llm_calls VALIDATE CONSTRAINT llm_calls_kind_check');
}
