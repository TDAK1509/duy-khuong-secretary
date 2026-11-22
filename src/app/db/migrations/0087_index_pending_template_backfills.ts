import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql(`
    CREATE INDEX CONCURRENTLY template_backfills_pending_created_at_idx
    ON template_backfills (created_at)
    WHERE status = 'pending'
  `);
}
