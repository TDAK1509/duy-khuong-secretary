import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  createExports(pgm);
  createExportRows(pgm);
  for (const table of ['company_exports', 'company_export_rows']) protectTable(pgm, table);
}

function createExports(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE company_exports (
      id uuid NOT NULL PRIMARY KEY,
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      requested_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
      kind text NOT NULL CHECK (kind IN ('documents', 'trip_report')),
      sheet_name text NOT NULL,
      columns jsonb NOT NULL CHECK (jsonb_typeof(columns) = 'array'),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX company_exports_id_workspace_id_key ON company_exports (id, workspace_id)');
  pgm.sql('CREATE INDEX company_exports_workspace_id_created_at_idx ON company_exports (workspace_id, created_at)');
}

function createExportRows(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE company_export_rows (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      export_id uuid NOT NULL,
      row_number integer NOT NULL CHECK (row_number >= 2),
      document_ids uuid[] NOT NULL,
      entry_ids uuid[] NOT NULL,
      cells jsonb NOT NULL CHECK (jsonb_typeof(cells) = 'object'),
      FOREIGN KEY (export_id, workspace_id) REFERENCES company_exports (id, workspace_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX company_export_rows_export_id_row_number_key ON company_export_rows (export_id, row_number)');
  pgm.sql('CREATE UNIQUE INDEX company_export_rows_id_workspace_id_key ON company_export_rows (id, workspace_id)');
}

function protectTable(pgm: MigrationBuilder, table: string): void {
  pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`CREATE POLICY in_scope ON ${table} USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`);
}
