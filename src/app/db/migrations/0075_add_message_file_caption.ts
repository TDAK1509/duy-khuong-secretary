import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['message_files']);
  pgm.sql('ALTER TABLE message_files ADD COLUMN caption text');
  pgm.sql('ALTER TABLE message_files ADD CONSTRAINT message_files_caption_check CHECK (caption IS NULL OR char_length(caption) <= 1000) NOT VALID');
}
