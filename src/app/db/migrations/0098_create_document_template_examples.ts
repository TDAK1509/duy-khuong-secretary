import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE document_template_examples (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      template_id uuid NOT NULL,
      position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
      source_document_id uuid,
      image_key text NOT NULL CHECK (btrim(image_key) <> ''),
      expected_reading jsonb NOT NULL CHECK (jsonb_typeof(expected_reading) = 'object'),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (template_id, workspace_id) REFERENCES document_templates (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (source_document_id, workspace_id) REFERENCES documents (id, workspace_id) ON DELETE SET NULL (source_document_id)
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX document_template_examples_template_id_position_key ON document_template_examples (template_id, position)');
  pgm.sql('CREATE UNIQUE INDEX document_template_examples_template_id_image_key_key ON document_template_examples (template_id, image_key)');
  pgm.sql('ALTER TABLE document_template_examples ENABLE ROW LEVEL SECURITY');
  pgm.sql(`CREATE POLICY in_scope ON document_template_examples USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`);
}
