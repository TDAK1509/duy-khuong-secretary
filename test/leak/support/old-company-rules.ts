import type { PoolClient } from 'pg';

const REQUIRE_A_CONDITION_SQL = `
  DELETE FROM company_knowledge_entries WHERE when_goods IS NULL AND when_vehicle_plate IS NULL AND when_driver_user_id IS NULL AND when_pickup_match_key IS NULL AND when_dropoff_match_key IS NULL;
  ALTER TABLE company_knowledge_entries DROP CONSTRAINT company_knowledge_entries_check2;
  ALTER TABLE company_knowledge_entries ADD CONSTRAINT company_knowledge_entries_check2
    CHECK (when_goods IS NOT NULL OR when_vehicle_plate IS NOT NULL OR when_driver_user_id IS NOT NULL OR when_pickup_match_key IS NOT NULL OR when_dropoff_match_key IS NOT NULL)
`;

const CREATE_WORKSPACE_RULES_SQL = `
  DROP TABLE IF EXISTS workspace_rules;
  CREATE TABLE workspace_rules (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    author_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    rule text NOT NULL CHECK (char_length(btrim(rule)) BETWEEN 1 AND 1000),
    created_at timestamptz NOT NULL DEFAULT now()
  )
`;

export async function restoreOldCompanyRules(client: PoolClient): Promise<void> {
  await client.query(REQUIRE_A_CONDITION_SQL);
  await client.query(CREATE_WORKSPACE_RULES_SQL);
}
