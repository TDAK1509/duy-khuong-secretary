import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql('DROP INDEX IF EXISTS documents_issuer_number_date_key');
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS documents_issuer_number_date_plate_key
    ON documents (workspace_id, issuer_key, document_number, document_date, coalesce(vehicle_plate, ''))
    WHERE status = 'accepted' AND issuer_key IS NOT NULL AND document_number IS NOT NULL AND document_date IS NOT NULL
  `);
  pgm.sql(`
    UPDATE documents waiting SET status = 'accepted'
    WHERE waiting.status = 'needs_review'
      AND NOT EXISTS (
        SELECT 1 FROM documents accepted
        WHERE accepted.status = 'accepted'
          AND accepted.workspace_id = waiting.workspace_id
          AND accepted.issuer_key = waiting.issuer_key
          AND accepted.document_number = waiting.document_number
          AND accepted.document_date = waiting.document_date
          AND coalesce(accepted.vehicle_plate, '') = coalesce(waiting.vehicle_plate, '')
      )
  `);
}
