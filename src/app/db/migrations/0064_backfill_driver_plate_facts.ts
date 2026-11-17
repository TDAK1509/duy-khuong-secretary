import type { MigrationBuilder } from '../migration-builder.ts';

const PLATE_PATTERN = `'\\d{2}[A-Z]-?\\d{3,4}\\.?\\d{2}'`;
const PLATE_VALUE_KEY = 'biensoxe';

const LATEST_PLATE_SENTENCE_OF_EACH_DRIVER = `
  SELECT DISTINCT ON (workspace_id, member_user_id)
    workspace_id, member_user_id, author_user_id, fact,
    regexp_replace(substring(fact FROM ${PLATE_PATTERN}), '[-.]', '', 'g') AS plate
  FROM member_facts
  WHERE fact ~ ${PLATE_PATTERN} AND readers = 'admins_and_member'
  ORDER BY workspace_id, member_user_id, created_at DESC, id DESC
`;

const ONLY_DRIVER_SCOPE = 'fact.vehicle_plate IS NULL AND fact.pickup_match_key IS NULL AND fact.dropoff_match_key IS NULL';

const HAS_PLATE_FACT = `EXISTS (
  SELECT 1 FROM facts fact JOIN fact_values value ON value.fact_id = fact.id
  WHERE fact.workspace_id = sentence.workspace_id AND fact.driver_user_id = sentence.member_user_id AND value.match_key = '${PLATE_VALUE_KEY}'
    AND ${ONLY_DRIVER_SCOPE}
)`;

export function up(pgm: MigrationBuilder): void {
  createPlateFacts(pgm);
  linkPlateFactsToDriverDocuments(pgm);
}

function createPlateFacts(pgm: MigrationBuilder): void {
  pgm.sql(`
    WITH pending AS (
      SELECT * FROM (${LATEST_PLATE_SENTENCE_OF_EACH_DRIVER}) sentence WHERE NOT ${HAS_PLATE_FACT}
    ),
    created AS (
      INSERT INTO facts (workspace_id, author_user_id, statement, driver_user_id)
      SELECT workspace_id, author_user_id, fact, member_user_id FROM pending
      RETURNING id, workspace_id, driver_user_id
    )
    INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, text_value)
    SELECT created.workspace_id, created.id, 0, 'Biển số xe', '${PLATE_VALUE_KEY}', pending.plate
    FROM created JOIN pending ON pending.workspace_id = created.workspace_id AND pending.member_user_id = created.driver_user_id
  `);
}

function linkPlateFactsToDriverDocuments(pgm: MigrationBuilder): void {
  pgm.sql(`
    INSERT INTO document_facts (workspace_id, document_id, fact_id)
    SELECT DISTINCT fact.workspace_id, document.id, fact.id
    FROM facts fact
    JOIN fact_values value ON value.fact_id = fact.id AND value.match_key = '${PLATE_VALUE_KEY}'
    JOIN documents document ON document.workspace_id = fact.workspace_id
    WHERE fact.driver_user_id IS NOT NULL
      AND ${ONLY_DRIVER_SCOPE}
      AND (
        document.driver_user_id = fact.driver_user_id
        OR EXISTS (
          SELECT 1 FROM document_sources source
          JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
          WHERE source.document_id = document.id AND message.user_id = fact.driver_user_id
        )
      )
    ON CONFLICT DO NOTHING
  `);
}
