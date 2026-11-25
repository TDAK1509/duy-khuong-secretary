import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE goods_names (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      author_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
      written_name text NOT NULL CHECK (char_length(btrim(written_name)) BETWEEN 1 AND 200),
      match_key text NOT NULL CHECK (match_key ~ '^[a-z0-9]+$'),
      shown_name text NOT NULL CHECK (char_length(btrim(shown_name)) BETWEEN 1 AND 80),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX goods_names_workspace_id_match_key_key ON goods_names (workspace_id, match_key)');
  pgm.sql('ALTER TABLE goods_names ENABLE ROW LEVEL SECURITY');
  pgm.sql(`CREATE POLICY in_scope ON goods_names USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`);
}
