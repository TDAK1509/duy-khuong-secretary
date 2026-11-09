import type { MigrationBuilder } from '../migration-builder.ts';

const SAME_PAPER = `
  other.workspace_id = waiting.workspace_id
  AND other.issuer_key = waiting.issuer_key
  AND other.document_number = waiting.document_number
  AND other.document_date = waiting.document_date
  AND coalesce(other.vehicle_plate, '') = coalesce(waiting.vehicle_plate, '')
`;
const ACCEPTED_OR_WAITING_EARLIER = `
  other.status = 'accepted'
  OR (other.status = 'needs_review' AND (other.created_at, other.id) < (waiting.created_at, waiting.id))
`;

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
        SELECT 1 FROM documents other WHERE ${SAME_PAPER} AND (${ACCEPTED_OR_WAITING_EARLIER})
      )
  `);
}
