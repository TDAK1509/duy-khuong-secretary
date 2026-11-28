import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  createReviews(pgm);
  createReviewChanges(pgm);
  for (const table of ['company_export_reviews', 'company_export_review_changes']) protectTable(pgm, table);
}

function createReviews(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE company_export_reviews (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      export_id uuid NOT NULL,
      message_file_id uuid NOT NULL REFERENCES message_files (id) ON DELETE CASCADE,
      status text NOT NULL CHECK (status IN ('pending', 'applied', 'dismissed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      applied_at timestamptz,
      FOREIGN KEY (export_id, workspace_id) REFERENCES company_exports (id, workspace_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX company_export_reviews_message_file_id_key ON company_export_reviews (message_file_id)');
  pgm.sql('CREATE UNIQUE INDEX company_export_reviews_id_workspace_id_key ON company_export_reviews (id, workspace_id)');
}

function createReviewChanges(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE company_export_review_changes (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      review_id uuid NOT NULL,
      export_row_id uuid NOT NULL,
      column_key text NOT NULL,
      value_type text NOT NULL CHECK (value_type IN ('text', 'number', 'date', 'boolean')),
      before_value jsonb NOT NULL,
      after_value jsonb NOT NULL,
      suggested_cause text NOT NULL CHECK (suggested_cause IN ('paper_reading', 'company_knowledge', 'unclear')),
      candidate_actions jsonb NOT NULL CHECK (jsonb_typeof(candidate_actions) = 'array'),
      status text NOT NULL CHECK (status IN ('pending', 'applied', 'dismissed', 'unsupported')),
      FOREIGN KEY (review_id, workspace_id) REFERENCES company_export_reviews (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (export_row_id, workspace_id) REFERENCES company_export_rows (id, workspace_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX company_export_review_changes_cell_key ON company_export_review_changes (review_id, export_row_id, column_key)');
}

function protectTable(pgm: MigrationBuilder, table: string): void {
  pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`CREATE POLICY in_scope ON ${table} USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`);
}
