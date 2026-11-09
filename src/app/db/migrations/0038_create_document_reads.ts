import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const NO_OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NULL`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE document_reads (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      message_id uuid NOT NULL,
      outcome text NOT NULL CHECK (outcome IN ('saved', 'no_document', 'test_data')),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (message_id, workspace_id) REFERENCES messages (id, workspace_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX document_reads_message_id_key ON document_reads (message_id)');
  protectTable(pgm, 'document_reads', `${WORKSPACE_IS_SET} AND ${NO_OWNER_IS_SET}`);
}

function protectTable(pgm: MigrationBuilder, table: string, condition: string): void {
  pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`CREATE POLICY in_scope ON ${table} USING (${condition}) WITH CHECK (${condition})`);
}
