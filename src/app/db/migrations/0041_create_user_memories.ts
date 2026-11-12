import type { MigrationBuilder } from '../migration-builder.ts';

const MEMORY_BELONGS_TO_OWNER = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
  AND user_id = nullif(current_setting('app.owner_user_id', true), '')::uuid`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE user_memories (
      workspace_id uuid NOT NULL,
      user_id uuid NOT NULL,
      markdown text NOT NULL CHECK (btrim(markdown) <> '' AND char_length(markdown) <= 2000),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, user_id),
      FOREIGN KEY (workspace_id, user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY');
  pgm.sql(`CREATE POLICY in_scope ON user_memories USING (${MEMORY_BELONGS_TO_OWNER}) WITH CHECK (${MEMORY_BELONGS_TO_OWNER})`);
}
