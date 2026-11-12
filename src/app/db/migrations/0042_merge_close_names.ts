import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['document_parties']);
  pgm.sql(`ALTER TABLE document_parties ADD COLUMN known_name text CHECK (known_name IS NULL OR btrim(known_name) <> '')`);
  createMergedNames(pgm);
}

function createMergedNames(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE merged_names (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      organization_id uuid NOT NULL,
      printed_name text NOT NULL CHECK (btrim(printed_name) <> ''),
      match_key text NOT NULL CHECK (match_key ~ '^[a-z0-9]+$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (organization_id, workspace_id) REFERENCES organizations (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id, match_key) REFERENCES organization_aliases (workspace_id, match_key) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX merged_names_workspace_id_match_key_key ON merged_names (workspace_id, match_key)');
  pgm.sql('ALTER TABLE merged_names ENABLE ROW LEVEL SECURITY');
  pgm.sql(
    `CREATE POLICY in_scope ON merged_names USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`,
  );
}
