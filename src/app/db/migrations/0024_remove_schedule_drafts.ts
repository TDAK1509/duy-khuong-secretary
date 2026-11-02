import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`UPDATE scheduled_tasks SET status = 'cancelled', next_run_at = NULL WHERE status = 'draft'`);
  pgm.sql(`UPDATE channel_identities SET pending_choice = NULL WHERE pending_choice ->> 'kind' = 'draft_confirm'`);
  pgm.sql(`UPDATE outbound_messages SET offered_choice = NULL WHERE offered_choice ->> 'kind' = 'draft_confirm'`);
}
