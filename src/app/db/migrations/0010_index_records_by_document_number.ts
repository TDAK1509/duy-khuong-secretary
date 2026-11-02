import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql(`
    CREATE INDEX CONCURRENTLY records_workspace_id_category_document_number_idx
    ON records (workspace_id, category, document_number)
    WHERE document_number IS NOT NULL
  `);
}
