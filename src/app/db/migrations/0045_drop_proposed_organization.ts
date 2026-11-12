import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['document_parties']);
  pgm.sql('ALTER TABLE document_parties ALTER COLUMN organization_id SET NOT NULL');
  pgm.sql('DROP INDEX document_parties_workspace_id_match_key_idx');
  pgm.sql('ALTER TABLE document_parties DROP COLUMN proposed_organization_id');
}
