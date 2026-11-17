import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['documents', 'memberships']);
  pgm.sql('ALTER TABLE documents ADD COLUMN driver_user_id uuid');
  pgm.sql(`
    ALTER TABLE documents
      ADD CONSTRAINT documents_workspace_id_driver_user_id_fkey
      FOREIGN KEY (workspace_id, driver_user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE SET NULL (driver_user_id) NOT VALID
  `);
}
