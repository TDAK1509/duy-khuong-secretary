import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE workspace_rules (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      author_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
      rule text NOT NULL CHECK (char_length(btrim(rule)) BETWEEN 1 AND 1000),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('CREATE INDEX workspace_rules_workspace_id_created_at_idx ON workspace_rules (workspace_id, created_at)');
  pgm.sql('ALTER TABLE workspace_rules ENABLE ROW LEVEL SECURITY');
  pgm.sql(`CREATE POLICY in_scope ON workspace_rules USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`);
}
