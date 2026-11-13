export const RESTORE_THE_PROPOSED_ORGANIZATION_SHAPE = `
  DELETE FROM pgmigrations WHERE name = '0052_drop_chatgpt_tables';
  CREATE TABLE chatgpt_login_codes (
    user_id uuid NOT NULL PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    membership_id uuid NOT NULL REFERENCES memberships (id) ON DELETE CASCADE,
    code_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE chatgpt_sign_ins (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    browser_key_hash text NOT NULL UNIQUE,
    client_id text NOT NULL,
    redirect_uri text NOT NULL,
    state text,
    code_challenge text NOT NULL,
    failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
    membership_id uuid REFERENCES memberships (id) ON DELETE CASCADE,
    authorization_code_hash text UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((membership_id IS NULL) = (authorization_code_hash IS NULL))
  );
  CREATE TABLE chatgpt_connections (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id uuid NOT NULL REFERENCES memberships (id) ON DELETE CASCADE,
    client_id text NOT NULL,
    access_token_hash text NOT NULL UNIQUE,
    access_expires_at timestamptz NOT NULL,
    refresh_token_hash text NOT NULL UNIQUE,
    refresh_expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX chatgpt_connections_membership_idx ON chatgpt_connections (membership_id);
  DELETE FROM pgmigrations WHERE name = '0051_fold_maintenance_rules_into_instructions';
  DELETE FROM pgmigrations WHERE name = '0050_index_outbound_messages_sending';
  DROP INDEX outbound_messages_sending_idx;
  DELETE FROM pgmigrations WHERE name = '0049_add_internal_users';
  DROP TABLE internal_sessions;
  DROP TABLE internal_login_codes;
  REVOKE INSERT (id, created_at) ON users FROM app_runtime;
  GRANT INSERT, UPDATE ON users TO app_runtime;
  ALTER TABLE users DROP COLUMN is_internal;
  DELETE FROM pgmigrations WHERE name = '0048_grant_starting_credits';
  DROP TABLE credit_additions;
  DROP TABLE llm_calls;
  ALTER TABLE workspaces DROP COLUMN credit_balance;
  DELETE FROM pgmigrations WHERE name = '0047_create_llm_calls_and_credits';
  DROP TABLE member_memories;
  DELETE FROM pgmigrations WHERE name = '0046_create_member_memories';
  DELETE FROM pgmigrations WHERE name = '0045_drop_proposed_organization';
  ALTER TABLE document_parties ADD COLUMN proposed_organization_id uuid;
  ALTER TABLE document_parties ALTER COLUMN organization_id DROP NOT NULL;
  CREATE INDEX document_parties_workspace_id_match_key_idx ON document_parties (workspace_id, match_key)
    WHERE proposed_organization_id IS NOT NULL;
`;
