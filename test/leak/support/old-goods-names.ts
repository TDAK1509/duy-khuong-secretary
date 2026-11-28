import type { PoolClient } from 'pg';

const REMOVE_SHOWN_GOODS_NAME_SQL = `
  ALTER TABLE company_knowledge_entries DROP COLUMN then_shown_goods_name;
  ALTER TABLE company_knowledge_entries ADD CONSTRAINT company_knowledge_entries_check3
    CHECK (then_customer IS NOT NULL OR then_dropoff IS NOT NULL OR then_wage_vnd IS NOT NULL OR then_rate_vnd_per_ton IS NOT NULL OR then_allowance_vnd IS NOT NULL OR then_note IS NOT NULL)
`;

const CREATE_GOODS_NAMES_SQL = `
  DROP TABLE IF EXISTS goods_names;
  CREATE TABLE goods_names (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    author_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    written_name text NOT NULL CHECK (char_length(btrim(written_name)) BETWEEN 1 AND 200),
    match_key text NOT NULL CHECK (match_key ~ '^[a-z0-9]+$'),
    shown_name text NOT NULL CHECK (char_length(btrim(shown_name)) BETWEEN 1 AND 80),
    created_at timestamptz NOT NULL DEFAULT now()
  )
`;

export async function restoreOldGoodsNames(client: PoolClient): Promise<void> {
  await client.query(REMOVE_SHOWN_GOODS_NAME_SQL);
  await client.query(CREATE_GOODS_NAMES_SQL);
}
