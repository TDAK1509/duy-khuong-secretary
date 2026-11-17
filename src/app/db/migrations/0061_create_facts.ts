import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  createFacts(pgm);
  createFactValues(pgm);
  createDocumentFacts(pgm);
  for (const table of ['facts', 'fact_values', 'document_facts']) protectTable(pgm, table);
}

function createFacts(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE facts (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      author_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
      statement text NOT NULL CHECK (btrim(statement) <> '' AND char_length(statement) <= 2000),
      vehicle_plate text CHECK (vehicle_plate ~ '^\\d{2}[A-Z]\\d{3,5}$'),
      driver_user_id uuid,
      pickup_name text,
      pickup_match_key text CHECK (pickup_match_key ~ '^[a-z0-9]+$'),
      dropoff_name text,
      dropoff_match_key text CHECK (dropoff_match_key ~ '^[a-z0-9]+$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((pickup_name IS NULL) = (pickup_match_key IS NULL)),
      CHECK ((dropoff_name IS NULL) = (dropoff_match_key IS NULL)),
      CHECK (vehicle_plate IS NOT NULL OR driver_user_id IS NOT NULL OR pickup_match_key IS NOT NULL OR dropoff_match_key IS NOT NULL),
      FOREIGN KEY (workspace_id, driver_user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX facts_id_workspace_id_key ON facts (id, workspace_id)');
  pgm.sql('CREATE INDEX facts_workspace_id_vehicle_plate_idx ON facts (workspace_id, vehicle_plate)');
}

function createFactValues(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE fact_values (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      fact_id uuid NOT NULL,
      position smallint NOT NULL CHECK (position >= 0),
      name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
      match_key text NOT NULL CHECK (match_key ~ '^[a-z0-9]+$'),
      number numeric CHECK (number >= 0),
      unit text CHECK (unit IS NULL OR btrim(unit) <> ''),
      text_value text CHECK (text_value IS NULL OR btrim(text_value) <> ''),
      CHECK ((number IS NULL) = (unit IS NULL)),
      CHECK ((number IS NULL) <> (text_value IS NULL)),
      FOREIGN KEY (fact_id, workspace_id) REFERENCES facts (id, workspace_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX fact_values_fact_id_match_key_key ON fact_values (fact_id, match_key)');
  pgm.sql('CREATE UNIQUE INDEX fact_values_fact_id_position_key ON fact_values (fact_id, position)');
}

function createDocumentFacts(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE document_facts (
      workspace_id uuid NOT NULL,
      document_id uuid NOT NULL,
      fact_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (document_id, fact_id),
      FOREIGN KEY (document_id, workspace_id) REFERENCES documents (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (fact_id, workspace_id) REFERENCES facts (id, workspace_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE INDEX document_facts_fact_id_idx ON document_facts (fact_id)');
}

function protectTable(pgm: MigrationBuilder, table: string): void {
  pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`CREATE POLICY in_scope ON ${table} USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`);
}
