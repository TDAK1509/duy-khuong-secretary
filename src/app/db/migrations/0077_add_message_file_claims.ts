import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['message_files']);
  pgm.sql('ALTER TABLE message_files ADD COLUMN claim_token uuid');
  pgm.sql('ALTER TABLE message_files ADD COLUMN locked_until timestamptz');
  pgm.sql('ALTER TABLE message_files ADD COLUMN attempts smallint NOT NULL DEFAULT 0');
  pgm.sql('ALTER TABLE message_files ADD COLUMN last_error text');
  pgm.sql('ALTER TABLE message_files ADD CONSTRAINT message_files_last_error_length_check CHECK (char_length(last_error) <= 200) NOT VALID');
}
