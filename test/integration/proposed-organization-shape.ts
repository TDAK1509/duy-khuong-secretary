export const RESTORE_THE_PROPOSED_ORGANIZATION_SHAPE = `
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
