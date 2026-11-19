import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql(`
    CREATE INDEX CONCURRENTLY documents_sheet_signature_date_idx
    ON documents (workspace_id, sheet_signature, document_date)
    WHERE sheet_signature IS NOT NULL
  `);
}
