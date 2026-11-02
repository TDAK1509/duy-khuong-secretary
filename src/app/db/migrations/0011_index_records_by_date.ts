import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql(`
    CREATE INDEX CONCURRENTLY records_workspace_id_category_occurred_on_idx
    ON records (workspace_id, category, occurred_on)
  `);
}
