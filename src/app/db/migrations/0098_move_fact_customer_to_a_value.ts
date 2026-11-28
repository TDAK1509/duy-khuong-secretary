import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const CUSTOMER_VALUE_NAME = 'Khách hàng';
const CUSTOMER_VALUE_KEY = 'khachhang';
const GOODS_VALUE_KEY = 'hanghoa';

const LINK_MATCHES_SQL = `
  INSERT INTO document_facts (workspace_id, document_id, fact_id)
  SELECT document.workspace_id, document.id, fact.id
  FROM facts fact
  LEFT JOIN LATERAL (
  SELECT nullif(regexp_replace(lower(unaccent(value.text_value)), '[^a-z0-9]', '', 'g'), '') AS key,
    coalesce((SELECT array_agg(DISTINCT token) FROM regexp_split_to_table(lower(unaccent(value.text_value)), '[^a-z0-9]+') token WHERE token <> ''), '{}') AS tokens
  FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = 'hanghoa') fact_goods ON true
  JOIN documents document ON document.workspace_id = fact.workspace_id
  WHERE fact.workspace_id = $1
    AND ($2::uuid IS NULL OR fact.id = $2)
    AND ($3::uuid[] IS NULL OR document.id = ANY($3::uuid[]))
    AND (NOT (fact.pickup_match_key IS NOT NULL OR fact.dropoff_match_key IS NOT NULL) OR (document.status = 'accepted' AND regexp_replace(lower(unaccent(document.kind)), '[^a-z0-9]', '', 'g') <> 'tinnhan' AND document.sheet_signature IS NULL))
    AND (fact.vehicle_plate IS NULL OR document.vehicle_plate = fact.vehicle_plate)
    AND (fact.driver_user_id IS NULL OR document.driver_user_id = fact.driver_user_id OR EXISTS (
  SELECT 1 FROM document_sources source
  JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
  WHERE source.document_id = document.id AND message.user_id = fact.driver_user_id
))
    AND (fact.pickup_match_key IS NULL OR (CASE WHEN fact.pickup_resolved THEN EXISTS (
    SELECT 1 FROM document_parties party
    JOIN fact_companies pick ON pick.fact_id = fact.id AND pick.slot = 'pickup' AND pick.organization_id = party.organization_id
    WHERE party.document_id = document.id
  ) ELSE EXISTS (
    SELECT 1 FROM document_parties party
    WHERE party.document_id = document.id
      AND (
        party.match_key = fact.pickup_match_key
        OR EXISTS (SELECT 1 FROM organization_aliases alias WHERE alias.organization_id = party.organization_id AND alias.match_key = fact.pickup_match_key)
      )
  ) END))
    AND (fact.dropoff_match_key IS NULL OR fact.pickup_match_key IS NOT NULL OR (CASE WHEN fact.dropoff_resolved THEN EXISTS (
    SELECT 1 FROM document_parties party
    JOIN fact_companies pick ON pick.fact_id = fact.id AND pick.slot = 'dropoff' AND pick.organization_id = party.organization_id
    WHERE party.document_id = document.id
  ) ELSE EXISTS (
    SELECT 1 FROM document_parties party
    WHERE party.document_id = document.id
      AND (
        party.match_key = fact.dropoff_match_key
        OR EXISTS (SELECT 1 FROM organization_aliases alias WHERE alias.organization_id = party.organization_id AND alias.match_key = fact.dropoff_match_key)
      )
  ) END))
    AND (fact_goods.key IS NULL OR EXISTS (
  SELECT 1 FROM (
  SELECT line.value AS text FROM document_lines line
  WHERE line.document_id = document.id AND line.item IS NULL AND regexp_replace(lower(unaccent(line.label)), '[^a-z0-9]', '', 'g') = 'hanghoa'
  UNION ALL
  SELECT line.item AS text FROM document_lines line WHERE line.document_id = document.id AND line.item IS NOT NULL) goods WHERE regexp_replace(lower(unaccent(goods.text)), '[^a-z0-9]', '', 'g') = fact_goods.key OR NOT EXISTS (
    SELECT 1 FROM unnest(fact_goods.tokens) wanted
    WHERE NOT EXISTS (SELECT 1 FROM regexp_split_to_table(lower(unaccent(goods.text)), '[^a-z0-9]+') token WHERE token <> '' AND (wanted = token OR (length(wanted) >= 4 AND starts_with(token, wanted)) OR (length(token) >= 4 AND starts_with(wanted, token))))
  )
))
  ON CONFLICT DO NOTHING
  RETURNING document_id
`;

const WITHOUT_CUSTOMER_VALUE = `NOT EXISTS (SELECT 1 FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${CUSTOMER_VALUE_KEY}')`;

const FACT_GOODS_KEY = `coalesce((SELECT regexp_replace(lower(unaccent(value.text_value)), '[^a-z0-9]', '', 'g') FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${GOODS_VALUE_KEY}'), '')`;

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['document_facts', 'fact_companies', 'fact_values', 'facts']);
  pgm.sql('CREATE TEMP TABLE migration_counts (name text PRIMARY KEY, count integer NOT NULL) ON COMMIT DROP');
  addCustomerValues(pgm);
  dropCustomerPicks(pgm);
  mergeFactsOfTheSameRoute(pgm);
  pgm.sql('DELETE FROM document_facts');
  pgm.sql('ALTER TABLE facts DROP COLUMN customer_name, DROP COLUMN customer_match_key, DROP COLUMN customer_resolved');
  relinkFacts(pgm);
  logCounts(pgm);
}

function addCustomerValues(pgm: MigrationBuilder): void {
  pgm.sql(`
    WITH added AS (
      INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, text_value)
      SELECT fact.workspace_id, fact.id,
        (SELECT coalesce(max(value.position) + 1, 0) FROM fact_values value WHERE value.fact_id = fact.id),
        '${CUSTOMER_VALUE_NAME}', '${CUSTOMER_VALUE_KEY}', fact.customer_name
      FROM facts fact
      WHERE fact.customer_name IS NOT NULL AND ${WITHOUT_CUSTOMER_VALUE}
      RETURNING 1
    )
    INSERT INTO migration_counts SELECT 'customer_values_added', count(*) FROM added
  `);
}

function dropCustomerPicks(pgm: MigrationBuilder): void {
  pgm.sql(`DELETE FROM fact_companies WHERE slot = 'customer'`);
  pgm.sql('ALTER TABLE fact_companies DROP CONSTRAINT fact_companies_slot_check');
  pgm.sql(`ALTER TABLE fact_companies ADD CONSTRAINT fact_companies_slot_check CHECK (slot IN ('pickup', 'dropoff'))`);
}

function mergeFactsOfTheSameRoute(pgm: MigrationBuilder): void {
  rankFactsOfTheSameRoute(pgm);
  copyValuesOnlyOlderFactsHave(pgm);
  deleteOlderFacts(pgm);
}

function rankFactsOfTheSameRoute(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TEMP TABLE route_fact_ranks ON COMMIT DROP AS
    SELECT fact.id, fact.workspace_id,
      first_value(fact.id) OVER same_route AS newest_id,
      row_number() OVER same_route AS rank
    FROM facts fact
    WHERE fact.pickup_match_key IS NOT NULL OR fact.dropoff_match_key IS NOT NULL
    WINDOW same_route AS (
      PARTITION BY fact.workspace_id, fact.vehicle_plate, fact.driver_user_id, fact.pickup_match_key, fact.dropoff_match_key, ${FACT_GOODS_KEY}
      ORDER BY fact.updated_at DESC, fact.created_at DESC, fact.id DESC
    )
  `);
}

function copyValuesOnlyOlderFactsHave(pgm: MigrationBuilder): void {
  pgm.sql(`
    INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, number, unit, text_value)
    SELECT only_older.workspace_id, only_older.newest_id,
      ((SELECT coalesce(max(newest.position) + 1, 0) FROM fact_values newest WHERE newest.fact_id = only_older.newest_id)
        + row_number() OVER (PARTITION BY only_older.newest_id ORDER BY only_older.rank, only_older.position) - 1)::smallint,
      only_older.name, only_older.match_key, only_older.number, only_older.unit, only_older.text_value
    FROM (
      SELECT DISTINCT ON (older.newest_id, value.match_key) older.newest_id, older.workspace_id, older.rank, value.position,
        value.name, value.match_key, value.number, value.unit, value.text_value
      FROM route_fact_ranks older JOIN fact_values value ON value.fact_id = older.id
      WHERE older.rank > 1
        AND NOT EXISTS (SELECT 1 FROM fact_values newest WHERE newest.fact_id = older.newest_id AND newest.match_key = value.match_key)
      ORDER BY older.newest_id, value.match_key, older.rank
    ) only_older
  `);
}

function deleteOlderFacts(pgm: MigrationBuilder): void {
  pgm.sql(`
    WITH merged AS (DELETE FROM facts WHERE id IN (SELECT id FROM route_fact_ranks WHERE rank > 1) RETURNING 1)
    INSERT INTO migration_counts SELECT 'facts_merged', count(*) FROM merged
  `);
}

function relinkFacts(pgm: MigrationBuilder): void {
  pgm.sql(`
    DO $relink$
    DECLARE workspace record;
    BEGIN
      FOR workspace IN SELECT id FROM workspaces LOOP
        EXECUTE $link$${LINK_MATCHES_SQL}$link$ USING workspace.id, NULL::uuid, NULL::uuid[];
      END LOOP;
    END
    $relink$
  `);
  pgm.sql(`INSERT INTO migration_counts SELECT 'facts_relinked', count(DISTINCT fact_id) FROM document_facts`);
}

function logCounts(pgm: MigrationBuilder): void {
  pgm.sql(`
    DO $log$
    BEGIN
      RAISE NOTICE '[migration] customer_values_added=% facts_merged=% facts_relinked=%',
        (SELECT count FROM migration_counts WHERE name = 'customer_values_added'),
        (SELECT count FROM migration_counts WHERE name = 'facts_merged'),
        (SELECT count FROM migration_counts WHERE name = 'facts_relinked');
    END
    $log$
  `);
}
