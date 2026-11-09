import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql('DROP INDEX IF EXISTS documents_issuer_number_date_key');
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS documents_issuer_number_date_plate_key
    ON documents (workspace_id, issuer_key, document_number, document_date, coalesce(vehicle_plate, ''))
    WHERE status = 'accepted' AND issuer_key IS NOT NULL AND document_number IS NOT NULL AND document_date IS NOT NULL
  `);
}
