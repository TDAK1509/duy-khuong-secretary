export const RESTORE_THE_PROPOSED_ORGANIZATION_SHAPE = `
  DELETE FROM pgmigrations WHERE name = '0045_drop_proposed_organization';
  ALTER TABLE document_parties ADD COLUMN proposed_organization_id uuid;
  ALTER TABLE document_parties ALTER COLUMN organization_id DROP NOT NULL;
  CREATE INDEX document_parties_workspace_id_match_key_idx ON document_parties (workspace_id, match_key)
    WHERE proposed_organization_id IS NOT NULL;
`;
