import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE member_memories (
      workspace_id uuid NOT NULL,
      user_id uuid NOT NULL,
      markdown text NOT NULL CHECK (btrim(markdown) <> '' AND char_length(markdown) <= 2000),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, user_id),
      FOREIGN KEY (workspace_id, user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('ALTER TABLE member_memories ENABLE ROW LEVEL SECURITY');
  pgm.sql(
    `CREATE POLICY in_scope ON member_memories USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`,
  );
}
