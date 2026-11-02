import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE reply_photos (
      reply_message_id uuid NOT NULL,
      source_message_id uuid NOT NULL,
      workspace_id uuid NOT NULL,
      PRIMARY KEY (reply_message_id, source_message_id),
      FOREIGN KEY (reply_message_id, workspace_id) REFERENCES messages (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (source_message_id, workspace_id) REFERENCES messages (id, workspace_id) ON DELETE CASCADE
    )
  `);
}
