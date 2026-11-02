import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE messages (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      author text NOT NULL CHECK (author IN ('user', 'bot')),
      text text,
      image_key text,
      inbound_event_id uuid REFERENCES inbound_events (id),
      event_part smallint CHECK (event_part >= 0),
      reply_to uuid REFERENCES messages (id) ON DELETE CASCADE,
      reply_kind text CHECK (reply_kind IN ('saved', 'answer')),
      submission_status text NOT NULL DEFAULT 'pending'
        CHECK (submission_status IN ('pending', 'accepted', 'duplicate', 'unresolved', 'failed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (text IS NOT NULL OR image_key IS NOT NULL),
      CHECK (author = 'bot' OR (inbound_event_id IS NOT NULL AND event_part IS NOT NULL)),
      CHECK ((reply_to IS NULL) = (reply_kind IS NULL))
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX messages_id_workspace_id_user_id_key ON messages (id, workspace_id, user_id)');
  pgm.sql('CREATE UNIQUE INDEX messages_id_workspace_id_key ON messages (id, workspace_id)');
  pgm.sql('CREATE UNIQUE INDEX messages_inbound_event_id_event_part_key ON messages (inbound_event_id, event_part)');
  pgm.sql('CREATE UNIQUE INDEX messages_reply_to_reply_kind_key ON messages (reply_to, reply_kind)');
  pgm.sql('CREATE INDEX messages_workspace_id_user_id_created_at_idx ON messages (workspace_id, user_id, created_at)');
}
