import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`UPDATE scheduled_tasks SET status = 'cancelled', next_run_at = NULL WHERE status = 'draft'`);
}
