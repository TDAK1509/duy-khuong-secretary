import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_SCOPE = `nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_OR_ANY_WHEN_UNSCOPED = `coalesce(${WORKSPACE_SCOPE}, workspace_id) = workspace_id AND NOT ${OWNER_IS_SET}`;
const WORKSPACE_ONLY = `workspace_id = ${WORKSPACE_SCOPE} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE template_backfills (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      template_id uuid NOT NULL,
      template_revision integer NOT NULL,
      requested_by_user_id uuid,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'stopped', 'superseded')),
      document_ids uuid[] NOT NULL CHECK (cardinality(document_ids) <= 5000),
      next_index integer NOT NULL DEFAULT 0,
      updated_count integer NOT NULL DEFAULT 0,
      unmatched_count integer NOT NULL DEFAULT 0,
      skipped_count integer NOT NULL DEFAULT 0,
      failed_count integer NOT NULL DEFAULT 0,
      stop_reason text CHECK (char_length(stop_reason) <= 200),
      claim_token uuid,
      locked_until timestamptz,
      attempts smallint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      FOREIGN KEY (template_id, workspace_id) REFERENCES document_templates (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id, requested_by_user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE SET NULL (requested_by_user_id)
    )
  `);
  pgm.sql('ALTER TABLE template_backfills ENABLE ROW LEVEL SECURITY');
  pgm.sql(`CREATE POLICY in_scope ON template_backfills USING (${WORKSPACE_OR_ANY_WHEN_UNSCOPED}) WITH CHECK (${WORKSPACE_ONLY})`);
}
