import type { MigrationBuilder } from '../migration-builder.ts';

const EARLIEST_WAITING_PARTY_OF_EACH_SPELLING = `
  SELECT DISTINCT ON (workspace_id, match_key) workspace_id, match_key, printed_name, proposed_organization_id AS organization_id
  FROM document_parties
  WHERE proposed_organization_id IS NOT NULL
  ORDER BY workspace_id, match_key, created_at, id
`;

export function up(pgm: MigrationBuilder): void {
  linkWaitingPartiesOfKnownSpellings(pgm);
  pgm.sql(`
    INSERT INTO organization_aliases (workspace_id, organization_id, printed_name, match_key)
    SELECT workspace_id, organization_id, printed_name, match_key FROM (${EARLIEST_WAITING_PARTY_OF_EACH_SPELLING}) earliest
  `);
  pgm.sql(`
    INSERT INTO merged_names (workspace_id, organization_id, printed_name, match_key)
    SELECT workspace_id, organization_id, printed_name, match_key FROM (${EARLIEST_WAITING_PARTY_OF_EACH_SPELLING}) earliest
  `);
  linkWaitingPartiesOfKnownSpellings(pgm);
}

function linkWaitingPartiesOfKnownSpellings(pgm: MigrationBuilder): void {
  pgm.sql(`
    UPDATE document_parties party
    SET organization_id = alias.organization_id, proposed_organization_id = NULL
    FROM organization_aliases alias
    WHERE party.proposed_organization_id IS NOT NULL
      AND alias.workspace_id = party.workspace_id
      AND alias.match_key = party.match_key
  `);
}
