import type { PoolClient } from 'pg';

const DROP_TABLES_SQL = `
  DROP TABLE IF EXISTS company_knowledge_links, company_knowledge_companies, company_knowledge_entries, document_facts, fact_companies, fact_values, facts CASCADE
`;

const CREATE_FACTS_SQL = `
  CREATE TABLE facts (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    author_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    statement text NOT NULL,
    vehicle_plate text,
    driver_user_id uuid,
    pickup_name text,
    pickup_match_key text,
    dropoff_name text,
    dropoff_match_key text,
    pickup_resolved boolean NOT NULL DEFAULT false,
    dropoff_resolved boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace_id, driver_user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX facts_id_workspace_id_key ON facts (id, workspace_id);
  CREATE TABLE fact_values (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    fact_id uuid NOT NULL,
    position smallint NOT NULL,
    name text NOT NULL,
    match_key text NOT NULL,
    number numeric,
    unit text,
    text_value text,
    FOREIGN KEY (fact_id, workspace_id) REFERENCES facts (id, workspace_id) ON DELETE CASCADE
  );
  CREATE TABLE fact_companies (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    fact_id uuid NOT NULL,
    slot text NOT NULL CHECK (slot IN ('pickup', 'dropoff')),
    organization_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (fact_id, workspace_id) REFERENCES facts (id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, workspace_id) REFERENCES organizations (id, workspace_id) ON DELETE RESTRICT
  );
  CREATE TABLE document_facts (
    workspace_id uuid NOT NULL,
    document_id uuid NOT NULL,
    fact_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, fact_id),
    FOREIGN KEY (document_id, workspace_id) REFERENCES documents (id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (fact_id, workspace_id) REFERENCES facts (id, workspace_id) ON DELETE CASCADE
  )
`;

export async function restoreOldFactTables(client: PoolClient): Promise<void> {
  await client.query(DROP_TABLES_SQL);
  await client.query(CREATE_FACTS_SQL);
}
