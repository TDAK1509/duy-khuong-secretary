import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE = `${WORKSPACE_IS_SET} AND NOT ${OWNER_IS_SET}`;

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['document_facts', 'fact_companies', 'fact_values', 'facts']);
  pgm.sql('CREATE TEMP TABLE migration_counts (name text PRIMARY KEY, count integer NOT NULL) ON COMMIT DROP');
  createEntries(pgm);
  createCompanies(pgm);
  createLinks(pgm);
  for (const table of ['company_knowledge_entries', 'company_knowledge_companies', 'company_knowledge_links']) protectTable(pgm, table);
  moveFacts(pgm);
}

function createEntries(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE company_knowledge_entries (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      author_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
      statement text NOT NULL CHECK (btrim(statement) <> '' AND char_length(statement) <= 2000),
      when_goods text CHECK (when_goods IS NULL OR char_length(btrim(when_goods)) BETWEEN 1 AND 200),
      when_vehicle_plate text CHECK (when_vehicle_plate ~ '^\\d{2}[A-Z]\\d{3,5}$'),
      when_driver_user_id uuid,
      when_pickup_name text,
      when_pickup_match_key text CHECK (when_pickup_match_key ~ '^[a-z0-9]+$'),
      when_pickup_resolved boolean NOT NULL DEFAULT false,
      when_dropoff_name text,
      when_dropoff_match_key text CHECK (when_dropoff_match_key ~ '^[a-z0-9]+$'),
      when_dropoff_resolved boolean NOT NULL DEFAULT false,
      then_customer text CHECK (then_customer IS NULL OR char_length(btrim(then_customer)) BETWEEN 1 AND 200),
      then_dropoff text CHECK (then_dropoff IS NULL OR char_length(btrim(then_dropoff)) BETWEEN 1 AND 200),
      then_wage_vnd numeric CHECK (then_wage_vnd >= 0),
      then_rate_vnd_per_ton numeric CHECK (then_rate_vnd_per_ton >= 0),
      then_allowance_vnd numeric CHECK (then_allowance_vnd >= 0),
      then_note text CHECK (then_note IS NULL OR char_length(btrim(then_note)) BETWEEN 1 AND 2000),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((when_pickup_name IS NULL) = (when_pickup_match_key IS NULL)),
      CHECK ((when_dropoff_name IS NULL) = (when_dropoff_match_key IS NULL)),
      CHECK (when_goods IS NOT NULL OR when_vehicle_plate IS NOT NULL OR when_driver_user_id IS NOT NULL OR when_pickup_match_key IS NOT NULL OR when_dropoff_match_key IS NOT NULL),
      CHECK (then_customer IS NOT NULL OR then_dropoff IS NOT NULL OR then_wage_vnd IS NOT NULL OR then_rate_vnd_per_ton IS NOT NULL OR then_allowance_vnd IS NOT NULL OR then_note IS NOT NULL),
      FOREIGN KEY (workspace_id, when_driver_user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX company_knowledge_entries_id_workspace_id_key ON company_knowledge_entries (id, workspace_id)');
  pgm.sql('CREATE INDEX company_knowledge_entries_workspace_id_vehicle_plate_idx ON company_knowledge_entries (workspace_id, when_vehicle_plate)');
  pgm.sql('CREATE INDEX company_knowledge_entries_workspace_id_pickup_match_key_idx ON company_knowledge_entries (workspace_id, when_pickup_match_key)');
}

function createCompanies(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE company_knowledge_companies (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      entry_id uuid NOT NULL,
      slot text NOT NULL CHECK (slot IN ('pickup', 'dropoff')),
      organization_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (entry_id, workspace_id) REFERENCES company_knowledge_entries (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id, workspace_id) REFERENCES organizations (id, workspace_id) ON DELETE RESTRICT
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX company_knowledge_companies_entry_id_slot_organization_id_key ON company_knowledge_companies (entry_id, slot, organization_id)');
  pgm.sql('CREATE INDEX company_knowledge_companies_workspace_id_organization_id_idx ON company_knowledge_companies (workspace_id, organization_id)');
}

function createLinks(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE company_knowledge_links (
      workspace_id uuid NOT NULL,
      document_id uuid NOT NULL,
      entry_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (document_id, entry_id),
      FOREIGN KEY (document_id, workspace_id) REFERENCES documents (id, workspace_id) ON DELETE CASCADE,
      FOREIGN KEY (entry_id, workspace_id) REFERENCES company_knowledge_entries (id, workspace_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE INDEX company_knowledge_links_entry_id_idx ON company_knowledge_links (entry_id)');
}

function protectTable(pgm: MigrationBuilder, table: string): void {
  pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`CREATE POLICY in_scope ON ${table} USING (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE}) WITH CHECK (${WORKSPACE_ONLY_OUTSIDE_A_MEMBER_SCOPE})`);
}

const PER_TRIP_UNIT = 'đ';
const PER_TON_UNIT = 'đ/tấn';

const MOVED_VALUE = `(
  (value.match_key = 'hanghoa' AND value.text_value IS NOT NULL)
  OR (value.match_key = 'khachhang' AND value.text_value IS NOT NULL)
  OR (value.match_key = 'luongtaixe' AND value.unit = '${PER_TRIP_UNIT}')
  OR (value.match_key = 'cuocvanchuyen' AND value.unit = '${PER_TON_UNIT}')
  OR (value.match_key = 'chiphiboiduong' AND value.unit = '${PER_TRIP_UNIT}')
)`;

function pickText(matchKey: string, maxLength: number): string {
  return `(SELECT left(btrim(value.text_value), ${maxLength}) FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${matchKey}' AND value.text_value IS NOT NULL)`;
}

function pickNumber(matchKey: string, unit: string): string {
  return `(SELECT value.number FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${matchKey}' AND value.unit = '${unit}')`;
}

const OTHER_VALUES_AS_NOTE = `(
  SELECT left(string_agg(value.name || ': ' || coalesce(value.text_value, value.number::text || ' ' || value.unit), E'\\n' ORDER BY value.position), 2000)
  FROM fact_values value WHERE value.fact_id = fact.id AND NOT ${MOVED_VALUE}
)`;

function moveFacts(pgm: MigrationBuilder): void {
  pgm.sql(`INSERT INTO migration_counts SELECT 'facts_moved', count(*) FROM facts`);
  pgm.sql(`
    INSERT INTO migration_counts
    SELECT 'notes_from_values', count(*) FROM facts fact
    WHERE EXISTS (SELECT 1 FROM fact_values value WHERE value.fact_id = fact.id AND NOT ${MOVED_VALUE})
  `);
  pgm.sql(`
    WITH inserted AS (
      INSERT INTO company_knowledge_entries (
        id, workspace_id, author_user_id, statement, when_goods, when_vehicle_plate, when_driver_user_id,
        when_pickup_name, when_pickup_match_key, when_pickup_resolved, when_dropoff_name, when_dropoff_match_key, when_dropoff_resolved,
        then_customer, then_wage_vnd, then_rate_vnd_per_ton, then_allowance_vnd, then_note, created_at, updated_at
      )
      SELECT fact.id, fact.workspace_id, fact.author_user_id, fact.statement, mapped.goods, fact.vehicle_plate, fact.driver_user_id,
        fact.pickup_name, fact.pickup_match_key, fact.pickup_resolved, fact.dropoff_name, fact.dropoff_match_key, fact.dropoff_resolved,
        mapped.customer, mapped.wage, mapped.rate, mapped.allowance,
        CASE
          WHEN mapped.note IS NOT NULL THEN mapped.note
          WHEN mapped.customer IS NULL AND mapped.wage IS NULL AND mapped.rate IS NULL AND mapped.allowance IS NULL THEN fact.statement
        END,
        fact.created_at, fact.updated_at
      FROM facts fact
      CROSS JOIN LATERAL (SELECT
        ${pickText('hanghoa', 200)} AS goods,
        ${pickText('khachhang', 200)} AS customer,
        ${pickNumber('luongtaixe', PER_TRIP_UNIT)} AS wage,
        ${pickNumber('cuocvanchuyen', PER_TON_UNIT)} AS rate,
        ${pickNumber('chiphiboiduong', PER_TRIP_UNIT)} AS allowance,
        ${OTHER_VALUES_AS_NOTE} AS note
      ) mapped
      RETURNING 1
    )
    INSERT INTO migration_counts SELECT 'entries_inserted', count(*) FROM inserted
  `);
}
