import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql(`
    CREATE INDEX CONCURRENTLY documents_workspace_id_template_id_idx
    ON documents (workspace_id, template_id)
  `);
}
