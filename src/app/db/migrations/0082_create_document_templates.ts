import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  createDocumentTemplates(pgm);
  createDocumentTemplateFields(pgm);
  for (const table of ['document_templates', 'document_template_fields']) protectTable(pgm, table);
}

function createDocumentTemplates(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE document_templates (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
      name_key text NOT NULL CHECK (name_key ~ '^[a-z0-9]+$'),
      kind text NOT NULL CHECK (btrim(kind) <> '' AND char_length(kind) <= 60),
      issuer_organization_id uuid,
      description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
      stage text CHECK (stage IN ('dispatch', 'receipt')),
      revision integer NOT NULL DEFAULT 1,
      created_by_user_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (issuer_organization_id, workspace_id) REFERENCES organizations (id, workspace_id) ON DELETE SET NULL (issuer_organization_id),
      FOREIGN KEY (workspace_id, created_by_user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE SET NULL (created_by_user_id)
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX document_templates_id_workspace_id_key ON document_templates (id, workspace_id)');
  pgm.sql('CREATE UNIQUE INDEX document_templates_workspace_id_name_key_key ON document_templates (workspace_id, name_key)');
}

function createDocumentTemplateFields(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE document_template_fields (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      template_id uuid NOT NULL,
      position smallint NOT NULL CHECK (position BETWEEN 1 AND 20),
      name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 60),
      name_key text NOT NULL CHECK (name_key ~ '^[a-z0-9]+$'),
      value_type text NOT NULL CHECK (value_type IN ('text', 'number', 'date')),
      unit text CHECK (unit IN ('kg', 'l', 'km', 'vnd')),
      required boolean NOT NULL DEFAULT false,
      CHECK (unit IS NULL OR value_type = 'number'),
      FOREIGN KEY (template_id, workspace_id) REFERENCES document_templates (id, workspace_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX document_template_fields_template_id_position_key ON document_template_fields (template_id, position)');
  pgm.sql('CREATE UNIQUE INDEX document_template_fields_template_id_value_type_name_key_key ON document_template_fields (template_id, value_type, name_key)');
}

function protectTable(pgm: MigrationBuilder, table: string): void {
  pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`CREATE POLICY in_scope ON ${table} USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`);
}
