import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['message_files']);
  pgm.sql('ALTER TABLE message_files VALIDATE CONSTRAINT message_files_caption_check');
}
