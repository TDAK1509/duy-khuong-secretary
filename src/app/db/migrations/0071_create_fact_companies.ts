import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE fact_companies (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      fact_id uuid NOT NULL,
      slot text NOT NULL CHECK (slot IN ('pickup', 'dropoff', 'customer')),
      organization_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (fact_id, workspace_id) REFERENCES facts (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id, workspace_id) REFERENCES organizations (id, workspace_id) ON DELETE RESTRICT
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX fact_companies_fact_id_slot_organization_id_key ON fact_companies (fact_id, slot, organization_id)');
  pgm.sql('CREATE INDEX fact_companies_workspace_id_organization_id_idx ON fact_companies (workspace_id, organization_id)');
  pgm.sql('ALTER TABLE fact_companies ENABLE ROW LEVEL SECURITY');
  pgm.sql(`CREATE POLICY in_scope ON fact_companies USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`);
}
