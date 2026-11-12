import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    UPDATE document_parties party
    SET organization_id = party.proposed_organization_id, proposed_organization_id = NULL
    WHERE party.proposed_organization_id IS NOT NULL
  `);
}
