import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE maintenance_notifications (
      task_id uuid NOT NULL REFERENCES scheduled_tasks (id) ON DELETE CASCADE,
      record_id uuid NOT NULL REFERENCES records (id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (task_id, record_id)
    )
  `);
}
