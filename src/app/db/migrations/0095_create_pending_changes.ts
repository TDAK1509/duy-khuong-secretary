import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const USER_IS_OWNER = `user_id = nullif(current_setting('app.owner_user_id', true), '')::uuid`;
const OWNED_BY_SCOPE = `${WORKSPACE_IS_SET} AND (NOT ${OWNER_IS_SET} OR ${USER_IS_OWNER})`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE pending_changes (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      user_id uuid NOT NULL,
      calls jsonb NOT NULL CHECK (jsonb_typeof(calls) = 'array'),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (workspace_id, user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX pending_changes_workspace_id_user_id_key ON pending_changes (workspace_id, user_id)');
  pgm.sql('ALTER TABLE pending_changes ENABLE ROW LEVEL SECURITY');
  pgm.sql(`CREATE POLICY in_scope ON pending_changes USING (${OWNED_BY_SCOPE}) WITH CHECK (${OWNED_BY_SCOPE})`);
}
