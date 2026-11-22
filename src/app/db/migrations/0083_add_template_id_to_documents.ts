import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['document_templates', 'documents']);
  pgm.sql('ALTER TABLE documents ADD COLUMN template_id uuid');
  pgm.sql(`
    ALTER TABLE documents
      ADD CONSTRAINT documents_workspace_id_template_id_fkey
      FOREIGN KEY (template_id, workspace_id) REFERENCES document_templates (id, workspace_id) ON DELETE SET NULL (template_id) NOT VALID
  `);
}
