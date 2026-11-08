import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const OWNER_ID = `nullif(current_setting('app.owner_user_id', true), '')::uuid`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;
const DOCUMENT_HAS_VISIBLE_SOURCE = `EXISTS (SELECT 1 FROM document_sources source WHERE source.document_id = documents.id)`;
const MESSAGE_IS_OWNED = `EXISTS (
  SELECT 1 FROM messages message WHERE message.id = document_sources.message_id AND message.user_id = ${OWNER_ID}
)`;

export function up(pgm: MigrationBuilder): void {
  createOrganizations(pgm);
  createOrganizationAliases(pgm);
  createDocuments(pgm);
  createDocumentSources(pgm);
  protectTable(pgm, 'organizations', WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE);
  protectTable(pgm, 'organization_aliases', WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE);
  protectTable(pgm, 'documents', `${WORKSPACE_IS_SET} AND (NOT ${OWNER_IS_SET} OR ${DOCUMENT_HAS_VISIBLE_SOURCE})`);
  protectTable(pgm, 'document_sources', `${WORKSPACE_IS_SET} AND (NOT ${OWNER_IS_SET} OR ${MESSAGE_IS_OWNED})`);
}

function createOrganizations(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE organizations (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      type text NOT NULL CHECK (type IN ('company', 'place')),
      name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 200),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX organizations_id_workspace_id_key ON organizations (id, workspace_id)');
  pgm.sql('CREATE INDEX organizations_workspace_id_name_idx ON organizations (workspace_id, name)');
}

function createOrganizationAliases(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE organization_aliases (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      organization_id uuid NOT NULL,
      printed_name text NOT NULL CHECK (btrim(printed_name) <> ''),
      match_key text NOT NULL CHECK (match_key ~ '^[a-z0-9]+$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (organization_id, workspace_id) REFERENCES organizations (id, workspace_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX organization_aliases_workspace_id_match_key_key ON organization_aliases (workspace_id, match_key)');
}

function createDocuments(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE documents (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (btrim(kind) <> ''),
      stage text CHECK (stage IN ('dispatch', 'receipt')),
      status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'needs_review')),
      document_number text,
      issuer_key text,
      document_date date,
      title text CHECK (title IS NULL OR btrim(title) <> ''),
      vehicle_plate text,
      summary text NOT NULL CHECK (char_length(summary) > 0),
      details jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(details) = 'array'),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX documents_id_workspace_id_key ON documents (id, workspace_id)');
  pgm.sql('CREATE INDEX documents_workspace_id_document_date_idx ON documents (workspace_id, document_date)');
  pgm.sql('CREATE INDEX documents_workspace_id_kind_idx ON documents (workspace_id, kind)');
}

function createDocumentSources(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE document_sources (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      document_id uuid NOT NULL,
      message_id uuid NOT NULL,
      item_index smallint NOT NULL CHECK (item_index >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (document_id, workspace_id) REFERENCES documents (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (message_id, workspace_id) REFERENCES messages (id, workspace_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX document_sources_message_id_item_index_key ON document_sources (message_id, item_index)');
  pgm.sql('CREATE INDEX document_sources_document_id_idx ON document_sources (document_id)');
}

function protectTable(pgm: MigrationBuilder, table: string, condition: string): void {
  pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`CREATE POLICY in_scope ON ${table} USING (${condition}) WITH CHECK (${condition})`);
}
