import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql(`
    CREATE INDEX CONCURRENTLY message_files_unfinished_created_at_idx
    ON message_files (created_at)
    WHERE processed_at IS NULL
  `);
}
