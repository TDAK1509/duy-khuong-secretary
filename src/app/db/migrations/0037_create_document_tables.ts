import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const OWNER_ID = `nullif(current_setting('app.owner_user_id', true), '')::uuid`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;
const MESSAGE_IS_OWNED = `EXISTS (
  SELECT 1 FROM messages message WHERE message.id = document_sources.message_id AND message.user_id = ${OWNER_ID}
)`;

export function up(pgm: MigrationBuilder): void {
  createOrganizations(pgm);
  createOrganizationAliases(pgm);
  createMeanings(pgm);
  createDocuments(pgm);
  createDocumentSources(pgm);
  createDocumentLines(pgm);
  createDocumentParties(pgm);
  protectTable(pgm, 'organizations', WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE);
  protectTable(pgm, 'organization_aliases', WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE);
  protectTable(pgm, 'meanings', WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE);
  protectTable(pgm, 'documents', scopeToDocumentsWithVisibleSource('documents.id'));
  protectTable(pgm, 'document_sources', `${WORKSPACE_IS_SET} AND (NOT ${OWNER_IS_SET} OR ${MESSAGE_IS_OWNED})`);
  protectTable(pgm, 'document_lines', scopeToDocumentsWithVisibleSource('document_lines.document_id'));
  protectTable(pgm, 'document_parties', scopeToDocumentsWithVisibleSource('document_parties.document_id'));
}

function scopeToDocumentsWithVisibleSource(documentIdColumn: string): string {
  const hasVisibleSource = `EXISTS (SELECT 1 FROM document_sources source WHERE source.document_id = ${documentIdColumn})`;
  return `${WORKSPACE_IS_SET} AND (NOT ${OWNER_IS_SET} OR ${hasVisibleSource})`;
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

function createMeanings(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE meanings (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      value_type text NOT NULL CHECK (value_type IN ('number', 'date')),
      name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
      match_key text NOT NULL CHECK (match_key ~ '^[a-z0-9]+$'),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX meanings_id_workspace_id_key ON meanings (id, workspace_id)');
  pgm.sql('CREATE UNIQUE INDEX meanings_workspace_id_value_type_match_key_key ON meanings (workspace_id, value_type, match_key)');
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
  pgm.sql(`
    CREATE UNIQUE INDEX documents_issuer_number_date_key ON documents (workspace_id, issuer_key, document_number, document_date)
    WHERE status = 'accepted' AND issuer_key IS NOT NULL AND document_number IS NOT NULL AND document_date IS NOT NULL
  `);
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

function createDocumentLines(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE document_lines (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      document_id uuid NOT NULL,
      line_no smallint NOT NULL CHECK (line_no >= 0),
      label text NOT NULL CHECK (btrim(label) <> ''),
      value text NOT NULL,
      item text CHECK (item IS NULL OR btrim(item) <> ''),
      number numeric CHECK (number >= 0),
      unit text,
      at timestamp without time zone,
      meaning_id uuid,
      CHECK ((number IS NULL) = (unit IS NULL) AND (unit IS NULL OR btrim(unit) <> '')),
      FOREIGN KEY (document_id, workspace_id) REFERENCES documents (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (meaning_id, workspace_id) REFERENCES meanings (id, workspace_id) ON DELETE RESTRICT
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX document_lines_document_id_line_no_key ON document_lines (document_id, line_no)');
  pgm.sql('CREATE INDEX document_lines_workspace_id_meaning_id_idx ON document_lines (workspace_id, meaning_id)');
}

function createDocumentParties(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE document_parties (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      document_id uuid NOT NULL,
      role text NOT NULL CHECK (role IN ('issuer', 'supplier', 'customer', 'carrier', 'place')),
      type text NOT NULL CHECK (type IN ('company', 'place')),
      printed_name text NOT NULL CHECK (btrim(printed_name) <> ''),
      match_key text NOT NULL CHECK (match_key ~ '^[a-z0-9]+$'),
      organization_id uuid,
      proposed_organization_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((organization_id IS NULL) <> (proposed_organization_id IS NULL)),
      FOREIGN KEY (document_id, workspace_id) REFERENCES documents (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id, workspace_id) REFERENCES organizations (id, workspace_id) ON DELETE RESTRICT,
      FOREIGN KEY (proposed_organization_id, workspace_id) REFERENCES organizations (id, workspace_id) ON DELETE RESTRICT
    )
  `);
  pgm.sql(
    'CREATE INDEX document_parties_workspace_id_organization_id_role_idx ON document_parties (workspace_id, organization_id, role)',
  );
  pgm.sql(`
    CREATE INDEX document_parties_workspace_id_match_key_idx ON document_parties (workspace_id, match_key)
    WHERE proposed_organization_id IS NOT NULL
  `);
  pgm.sql('CREATE INDEX document_parties_document_id_idx ON document_parties (document_id)');
}

function protectTable(pgm: MigrationBuilder, table: string, condition: string): void {
  pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`CREATE POLICY in_scope ON ${table} USING (${condition}) WITH CHECK (${condition})`);
}
